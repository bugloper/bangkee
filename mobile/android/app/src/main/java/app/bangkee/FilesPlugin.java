package app.bangkee;

import android.content.ClipData;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import android.util.Base64;
import android.widget.Toast;
import androidx.annotation.RequiresApi;
import androidx.core.content.FileProvider;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;

/**
 * Sharing and saving the documents the web app makes (statements, receipts,
 * supplier statements), which Android's WebView cannot do itself: it has no
 * Web Share, and it ignores <a download> on the blob: URL the web app creates.
 * MainActivity points navigator.share and those downloads at this plugin
 * (see assets/bangkee-shims.js), so web/src/lib/share.ts runs unchanged.
 *
 * Files go through the app's cache (cache/documents, offered to other apps by
 * the FileProvider) and are cleared after a day.
 */
@CapacitorPlugin(name = "BangkeeFiles")
public class FilesPlugin extends Plugin {

    static final String DIRECTORY = "documents";
    private static final long KEEP_MS = 24L * 60 * 60 * 1000;

    /** The share sheet, with the file attached when there is one. */
    @PluginMethod
    public void share(PluginCall call) {
        String text = call.getString("text", "");
        String title = call.getString("title", "");
        String data = call.getString("data");
        Intent send = new Intent(Intent.ACTION_SEND);
        try {
            if (data != null) {
                String type = call.getString("mimeType", "application/octet-stream");
                Uri uri = cacheUri(getContext(), FileNames.withExtension(call.getString("filename"), type), decode(data));
                send.setType(type);
                send.putExtra(Intent.EXTRA_STREAM, uri);
                send.setClipData(ClipData.newRawUri(title, uri));
                send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            } else {
                send.setType("text/plain");
            }
        } catch (IOException | IllegalArgumentException e) {
            call.reject("That document could not be shared.");
            return;
        }
        if (!text.isEmpty()) send.putExtra(Intent.EXTRA_TEXT, text);
        if (!title.isEmpty()) send.putExtra(Intent.EXTRA_SUBJECT, title);
        Intent chooser = Intent.createChooser(send, title.isEmpty() ? null : title);
        chooser.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        getActivity().runOnUiThread(() -> {
            try {
                getActivity().startActivity(chooser);
                call.resolve();
            } catch (RuntimeException e) {
                call.reject("No app on this phone can share that.");
            }
        });
    }

    /** Saves the file to Downloads (Android 10 and later), or opens it to save from the viewer. */
    @PluginMethod
    public void save(PluginCall call) {
        String data = call.getString("data");
        if (data == null) {
            call.reject("Nothing to save.");
            return;
        }
        String type = call.getString("mimeType", "application/octet-stream");
        String name = FileNames.withExtension(call.getString("filename"), type);
        byte[] bytes;
        try {
            bytes = decode(data);
        } catch (IllegalArgumentException e) {
            call.reject("That document could not be saved.");
            return;
        }
        Context context = getContext();
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                saveToDownloads(context, name, type, bytes);
                getActivity().runOnUiThread(() -> Toast.makeText(context, context.getString(R.string.saved_to_downloads, name), Toast.LENGTH_SHORT).show());
            } else {
                // Before Android 10 writing to Downloads needs a storage permission the
                // app does not ask for; the viewer it opens in can save or share it.
                open(getActivity(), cacheUri(context, name, bytes), type);
            }
            call.resolve();
        } catch (IOException e) {
            call.reject("That document could not be saved.");
        }
    }

    @RequiresApi(Build.VERSION_CODES.Q)
    private static void saveToDownloads(Context context, String name, String type, byte[] bytes) throws IOException {
        ContentResolver resolver = context.getContentResolver();
        ContentValues values = new ContentValues();
        values.put(MediaStore.Downloads.DISPLAY_NAME, name);
        values.put(MediaStore.Downloads.MIME_TYPE, type);
        values.put(MediaStore.Downloads.IS_PENDING, 1);
        Uri uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
        if (uri == null) throw new IOException("Downloads refused the file");
        try (OutputStream out = resolver.openOutputStream(uri)) {
            if (out == null) throw new IOException("Downloads gave no stream");
            out.write(bytes);
        } catch (IOException e) {
            resolver.delete(uri, null, null);
            throw e;
        }
        values.clear();
        values.put(MediaStore.Downloads.IS_PENDING, 0);
        resolver.update(uri, values, null, null);
    }

    /** Opens a file in whichever app views its type (a PDF viewer, the gallery). */
    static void open(android.app.Activity activity, Uri uri, String type) {
        Intent view = new Intent(Intent.ACTION_VIEW).setDataAndType(uri, type).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        activity.runOnUiThread(() -> {
            try {
                activity.startActivity(view);
            } catch (RuntimeException e) {
                Toast.makeText(activity, R.string.no_app_for_file, Toast.LENGTH_SHORT).show();
            }
        });
    }

    /** Writes the bytes into cache/documents and returns the FileProvider URI other apps can read. */
    static Uri cacheUri(Context context, String name, byte[] bytes) throws IOException {
        File file = cacheFile(context, name);
        try (FileOutputStream out = new FileOutputStream(file)) {
            out.write(bytes);
        }
        return FileProvider.getUriForFile(context, context.getPackageName() + ".fileprovider", file);
    }

    /** Copies a stream into cache/documents, refusing anything over the limit. */
    static Uri cacheUri(Context context, String name, InputStream in, long limit) throws IOException {
        File file = cacheFile(context, name);
        long total = 0;
        byte[] buffer = new byte[16 * 1024];
        try (FileOutputStream out = new FileOutputStream(file)) {
            for (int n; (n = in.read(buffer)) != -1; ) {
                total += n;
                if (total > limit) throw new IOException("Too large");
                out.write(buffer, 0, n);
            }
        } catch (IOException e) {
            //noinspection ResultOfMethodCallIgnored
            file.delete();
            throw e;
        }
        return FileProvider.getUriForFile(context, context.getPackageName() + ".fileprovider", file);
    }

    private static File cacheFile(Context context, String name) throws IOException {
        File directory = new File(context.getCacheDir(), DIRECTORY);
        if (!directory.isDirectory() && !directory.mkdirs()) throw new IOException("No cache directory");
        File[] old = directory.listFiles();
        if (old != null) {
            long cutoff = System.currentTimeMillis() - KEEP_MS;
            for (File f : old) {
                //noinspection ResultOfMethodCallIgnored
                if (f.lastModified() < cutoff) f.delete();
            }
        }
        return new File(directory, FileNames.safe(name));
    }

    private static byte[] decode(String base64) {
        return Base64.decode(base64, Base64.DEFAULT);
    }
}
