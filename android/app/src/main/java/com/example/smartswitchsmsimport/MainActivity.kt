package com.example.smartswitchsmsimport

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.provider.OpenableColumns
import android.widget.Button
import android.widget.TextView
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import org.xmlpull.v1.XmlPullParser
import org.xmlpull.v1.XmlPullParserFactory

class MainActivity : AppCompatActivity() {

    private lateinit var statusText: TextView

    private val pickXmlFileLauncher =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            if (result.resultCode == Activity.RESULT_OK) {
                val uri = result.data?.data
                if (uri != null) {
                    handleXmlFile(uri)
                } else {
                    statusText.text = "No file selected."
                }
            } else {
                statusText.text = "File selection canceled."
            }
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        statusText = findViewById(R.id.statusText)

        val pickButton: Button = findViewById(R.id.pickFileButton)
        pickButton.setOnClickListener {
            val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                addCategory(Intent.CATEGORY_OPENABLE)
                type = "text/*"
            }
            pickXmlFileLauncher.launch(intent)
        }
    }

    private fun handleXmlFile(uri: Uri) {
        val name = getFileName(uri) ?: "sms_export.xml"
        statusText.text = "Selected: $name\nParsing..."

        try {
            val count = parseSmsBackupXml(uri)
            statusText.text = "Parsed $count messages from $name.\n" +
                "Next step: insert into SMS provider (requires default SMS app privileges)."
        } catch (e: Exception) {
            statusText.text = "Failed to parse XML: ${e.message}"
        }
    }

    private fun getFileName(uri: Uri): String? {
        contentResolver.query(uri, null, null, null, null)?.use { cursor ->
            val nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
            if (cursor.moveToFirst() && nameIndex >= 0) {
                return cursor.getString(nameIndex)
            }
        }
        return null
    }

    private fun parseSmsBackupXml(uri: Uri): Int {
        val inputStream = contentResolver.openInputStream(uri) ?: return 0

        val factory = XmlPullParserFactory.newInstance()
        factory.isNamespaceAware = true
        val parser = factory.newPullParser()
        parser.setInput(inputStream, "UTF-8")

        var eventType = parser.eventType
        var messageCount = 0

        while (eventType != XmlPullParser.END_DOCUMENT) {
            if (eventType == XmlPullParser.START_TAG && parser.name == "sms") {
                val address = parser.getAttributeValue(null, "address") ?: ""
                val body = parser.getAttributeValue(null, "body") ?: ""
                val date = parser.getAttributeValue(null, "date") ?: ""
                val type = parser.getAttributeValue(null, "type") ?: ""
                val read = parser.getAttributeValue(null, "read") ?: ""

                // At this point you could build ContentValues objects and
                // insert them into the SMS provider once the app is set
                // as the default SMS handler.

                if (address.isNotEmpty() && body.isNotEmpty()) {
                    messageCount++
                }
            }
            eventType = parser.next()
        }

        inputStream.close()
        return messageCount
    }
}

