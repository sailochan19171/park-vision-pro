VayAccess On-Site Agent — Portable Bundle
==========================================

This folder is a complete, self-contained VayAccess on-site agent.
It contains Python + every dependency (YOLO, OpenCV, EasyOCR, Flask)
built in, so the target PC does NOT need Python, git, or the internet.

What this bundle does at each gate PC:
--------------------------------------
- Reads the UHF tag from the SRK reader on the LAN
- Pulls the RTSP video from the ANPR camera on the LAN
- Runs YOLO + OCR locally to identify vehicle + plate
- Saves each capture (full frame + plate crop) to disk
- Pushes UHF events + a live JPEG frame stream to the cloud portal
  at https://vayaccess-cloud.onrender.com

Everything above runs as a Windows Scheduled Task fired 30 seconds
after every boot — no human login needed. Auto-restarts on crash.


Install (once per gate PC)
--------------------------
1. Copy this entire folder to the gate PC (USB, network share, cloud
   storage). It does not matter where.

2. Right-click the Windows Start button -> "Windows PowerShell (Admin)".

3. In that admin PowerShell, cd to the folder:
     cd "C:\path\to\this\bundle"

4. Run:
     .\install.ps1

5. Answer the prompts:
     DATABASE_URL         Neon postgres connection string
     CLOUD_PUSH_URL       (Enter for default: https://vayaccess-cloud.onrender.com)
     CLOUD_PUSH_TOKEN     The 64-char token from Render's env vars
     Camera IP            (Enter to keep default 192.168.1.12)
     RFID reader IP       (Enter to keep default 192.168.0.200)

6. Done. The agent is now:
     - Installed at C:\Program Files\VayAccess\
     - Registered as the "VayAccessOnSiteAgent" scheduled task
     - Running right now


Verify it's working
-------------------
Watch the log stream in real time:

  Get-Content 'C:\Program Files\VayAccess\logs\*.log' -Wait -Tail 20

You should see:
  [RFID] Connected successfully!
  [CAM]  RTSP connected successfully.
  [CLOUD-STREAM] starting pusher -> ... fps=10 jpeg_q=60
  [CLOUD-STREAM] pushed 60 frames (failures=0, last=~25 KB)

If any of those lines is missing, check that:
  - Camera + UHF reader are powered on and reachable via ping
  - .env file has correct DATABASE_URL and CLOUD_PUSH_TOKEN
  - The gate PC has internet access to reach *.onrender.com


Uninstall
---------
Right-click PowerShell -> Run as administrator, then:

  cd "C:\Program Files\VayAccess"
  .\uninstall.ps1


Reconfigure (e.g. rotate the token, change camera IP)
-----------------------------------------------------
Two options:

A. Edit the .env file directly:
     notepad "C:\Program Files\VayAccess\.env"
   Then restart the task:
     Stop-ScheduledTask  -TaskName VayAccessOnSiteAgent
     Start-ScheduledTask -TaskName VayAccessOnSiteAgent

B. Re-run install.ps1 (it will overwrite the install cleanly).


Support checklist for the field operator
----------------------------------------
1. Is the RJ-45 Ethernet cable plugged into the PC?
2. Are all indicator LEDs green on the UHF reader?
3. Is the ANPR camera powered on (fan sound, status LED)?
4. Can the gate PC reach the internet?
     ping vayaccess-cloud.onrender.com
5. Is the scheduled task in "Running" state?
     Get-ScheduledTask VayAccessOnSiteAgent | Select TaskName, State

If steps 1-4 pass and step 5 says "Ready" or "Disabled", start the
task manually:
     Start-ScheduledTask -TaskName VayAccessOnSiteAgent
