package com.farmleysfa

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.provider.OpenableColumns
import com.facebook.react.bridge.*
import java.io.BufferedReader
import java.io.InputStreamReader

class FilePickerModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext), ActivityEventListener {
    private var pickerPromise: Promise? = null

    init {
        reactContext.addActivityEventListener(this)
    }

    override fun getName() = "FilePicker"

    @ReactMethod
    fun pickCSV(promise: Promise) {
        val activity = reactApplicationContext.currentActivity
        if (activity == null) {
            promise.reject("NO_ACTIVITY", "No activity available")
            return
        }
        pickerPromise = promise
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = "*/*"
            putExtra(Intent.EXTRA_MIME_TYPES, arrayOf("text/csv", "text/comma-separated-values", "application/csv", "text/plain"))
        }
        try {
            activity.startActivityForResult(intent, PICK_CSV_REQUEST)
        } catch (e: Exception) {
            pickerPromise = null
            promise.reject("PICK_ERROR", e.message)
        }
    }

    override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode != PICK_CSV_REQUEST) return
        val promise = pickerPromise ?: return
        pickerPromise = null

        if (resultCode != Activity.RESULT_OK || data?.data == null) {
            promise.reject("CANCELLED", "File selection cancelled")
            return
        }

        try {
            val uri: Uri = data.data!!
            val resolver = reactApplicationContext.contentResolver

            var fileName = "unknown.csv"
            resolver.query(uri, null, null, null, null)?.use { cursor ->
                if (cursor.moveToFirst()) {
                    val idx = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                    if (idx >= 0) fileName = cursor.getString(idx)
                }
            }

            val inputStream = resolver.openInputStream(uri)
            val reader = BufferedReader(InputStreamReader(inputStream))
            val content = reader.readText()
            reader.close()

            val result = Arguments.createMap().apply {
                putString("name", fileName)
                putString("content", content)
                putString("uri", uri.toString())
            }
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("READ_ERROR", e.message)
        }
    }

    override fun onNewIntent(intent: Intent) {}

    companion object {
        const val PICK_CSV_REQUEST = 9001
    }
}
