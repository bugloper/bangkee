package app.bangkee;

import java.util.Locale;

/**
 * File names that came from the web page (a PDF's download name) or a server's
 * Content-Disposition, made safe to write into the app's cache or Downloads: no
 * directories, no control characters, a sensible length, and never empty.
 *
 * Plain Java so it runs in JVM unit tests.
 */
final class FileNames {

    static final String FALLBACK = "document";
    private static final int MAX_LENGTH = 120;

    private FileNames() {}

    static String safe(String name) {
        if (name == null) return FALLBACK;
        // Only the last segment: "../../x.pdf" and "C:\\x.pdf" become "x.pdf".
        String last = name.replace('\\', '/');
        last = last.substring(last.lastIndexOf('/') + 1);
        StringBuilder out = new StringBuilder(last.length());
        for (int i = 0; i < last.length(); i++) {
            char c = last.charAt(i);
            if (c < 0x20 || c == 0x7f || ":*?\"<>|".indexOf(c) >= 0) out.append('_');
            else out.append(c);
        }
        String cleaned = out.toString().trim();
        while (cleaned.startsWith(".")) cleaned = cleaned.substring(1);
        if (cleaned.isEmpty()) return FALLBACK;
        if (cleaned.length() > MAX_LENGTH) {
            int dot = cleaned.lastIndexOf('.');
            String extension = dot > 0 && cleaned.length() - dot <= 8 ? cleaned.substring(dot) : "";
            cleaned = cleaned.substring(0, MAX_LENGTH - extension.length()).trim() + extension;
        }
        return cleaned;
    }

    /** The name with the extension the type calls for, when it has none. */
    static String withExtension(String name, String mimeType) {
        String safe = safe(name);
        String type = mimeType == null ? "" : mimeType.toLowerCase(Locale.ROOT);
        String extension;
        switch (type) {
            case "application/pdf": extension = ".pdf"; break;
            case "image/png": extension = ".png"; break;
            case "image/jpeg": extension = ".jpg"; break;
            case "image/webp": extension = ".webp"; break;
            case "image/heic": extension = ".heic"; break;
            default: return safe;
        }
        if (safe.toLowerCase(Locale.ROOT).endsWith(extension) || (extension.equals(".jpg") && safe.toLowerCase(Locale.ROOT).endsWith(".jpeg"))) return safe;
        return safe + extension;
    }
}
