const net = require('net');
const EventEmitter = require('events');

class AsteriskService extends EventEmitter {
  constructor() {
    super();
    this.amiConnection = null;
    this.isConnected = false;
    this.config = {
      host: process.env.ASTERISK_HOST || 'localhost',
      port: process.env.ASTERISK_PORT || 5038,
      username: process.env.ASTERISK_USERNAME || 'admin',
      password: process.env.ASTERISK_PASSWORD || 'admin',
      extension: process.env.AGENT_EXTENSION || '1001',
      context: process.env.ASTERISK_CONTEXT || 'from-internal',
      trunk: process.env.SIP_TRUNK || 'twilio-trunk'
    };
  }

  // Connect to Asterisk Manager Interface (AMI)
  async connect() {
    return new Promise((resolve, reject) => {
      this.amiConnection = new net.Socket();
      
      this.amiConnection.connect(this.config.port, this.config.host, () => {
        console.log(' Connected to Asterisk AMI');
        this.isConnected = true;
      });

      this.amiConnection.on('data', (data) => {
        const response = data.toString();
        console.log(' AMI Response:', response);
        
        if (response.includes('Authentication accepted')) {
          console.log(' AMI Authentication successful');
          resolve();
        } else if (response.includes('Authentication failed')) {
          reject(new Error('AMI Authentication failed'));
        }
      });

      this.amiConnection.on('error', (error) => {
        console.error(' AMI Connection error:', error);
        reject(error);
      });

      // Send login credentials
      setTimeout(() => {
        this.amiConnection.write(`Action: Login\r\nUsername: ${this.config.username}\r\nSecret: ${this.config.password}\r\n\r\n`);
      }, 1000);
    });
  }

  // Originate a call to customer and connect to agent
  async originateCall(customerPhone, agentExtension = null) {
    return new Promise((resolve, reject) => {
      if (!this.isConnected) {
        reject(new Error('Not connected to Asterisk AMI'));
        return;
      }

      const extension = agentExtension || this.config.extension;
      const sessionId = `call_${Date.now()}`;
      
      const originateCommand = [
        'Action: Originate',
        `Channel: SIP/${this.config.trunk}/${customerPhone}`,
        `Exten: ${extension}`,
        `Context: ${this.config.context}`,
        'Priority: 1',
        'Async: true',
        `Variable: sessionId=${sessionId}`,
        `Variable: customerPhone=${customerPhone}`,
        '\r\n'
      ].join('\r\n');

      console.log(' Originating call:', originateCommand);

      this.amiConnection.write(originateCommand);

      // Listen for response
      const onData = (data) => {
        const response = data.toString();
        
        if (response.includes('Success')) {
          console.log(' Call originated successfully');
          this.emit('call-originated', { sessionId, customerPhone, extension });
          resolve({ success: true, sessionId, message: 'Call originated successfully' });
        } else if (response.includes('Error')) {
          console.error(' Call origination failed:', response);
          reject(new Error('Failed to originate call'));
        }
      };

      this.amiConnection.once('data', onData);

      // Timeout after 10 seconds
      setTimeout(() => {
        this.amiConnection.removeListener('data', onData);
        reject(new Error('Call origination timeout'));
      }, 10000);
    });
  }

  // Get call status
  async getCallStatus(channelId) {
    return new Promise((resolve, reject) => {
      if (!this.isConnected) {
        reject(new Error('Not connected to Asterisk AMI'));
        return;
      }

      const statusCommand = [
        'Action: Status',
        `Channel: ${channelId}`,
        '\r\n'
      ].join('\r\n');

      this.amiConnection.write(statusCommand);

      const onData = (data) => {
        const response = data.toString();
        console.log(' Call status:', response);
        
        if (response.includes('Status:')) {
          resolve({ success: true, status: response });
        }
      };

      this.amiConnection.once('data', onData);

      setTimeout(() => {
        this.amiConnection.removeListener('data', onData);
        reject(new Error('Status check timeout'));
      }, 5000);
    });
  }

  // Hang up a call
  async hangupCall(channelId) {
    return new Promise((resolve, reject) => {
      if (!this.isConnected) {
        reject(new Error('Not connected to Asterisk AMI'));
        return;
      }

      const hangupCommand = [
        'Action: Hangup',
        `Channel: ${channelId}`,
        '\r\n'
      ].join('\r\n');

      this.amiConnection.write(hangupCommand);

      const onData = (data) => {
        const response = data.toString();
        
        if (response.includes('Success')) {
          resolve({ success: true, message: 'Call hung up successfully' });
        } else {
          reject(new Error('Failed to hang up call'));
        }
      };

      this.amiConnection.once('data', onData);

      setTimeout(() => {
        this.amiConnection.removeListener('data', onData);
        reject(new Error('Hangup timeout'));
      }, 5000);
    });
  }

  // Disconnect from AMI
  disconnect() {
    if (this.amiConnection) {
      this.amiConnection.write('Action: Logoff\r\n\r\n');
      this.amiConnection.end();
      this.isConnected = false;
      console.log(' Disconnected from Asterisk AMI');
    }
  }

  // Check connection status
  isAlive() {
    return this.isConnected;
  }
}

module.exports = new AsteriskService();

