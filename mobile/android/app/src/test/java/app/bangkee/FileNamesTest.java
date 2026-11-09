package app.bangkee;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class FileNamesTest {

    @Test
    public void ordinaryNamesAreKept() {
        assertEquals("Statement Dawa Tashi start to today.pdf", FileNames.safe("Statement Dawa Tashi start to today.pdf"));
        assertEquals("Receipt R-0012.pdf", FileNames.safe("Receipt R-0012.pdf"));
    }

    @Test
    public void directoriesAreDropped() {
        assertEquals("x.pdf", FileNames.safe("../../x.pdf"));
        assertEquals("x.pdf", FileNames.safe("C:\\Users\\x.pdf"));
        assertEquals("hidden", FileNames.safe("..hidden"));
    }

    @Test
    public void controlAndReservedCharactersAreReplaced() {
        assertEquals("a_b_c.pdf", FileNames.safe("a\nb:c.pdf"));
        assertEquals("what_.pdf", FileNames.safe("what?.pdf"));
    }

    @Test
    public void emptyBecomesAFallback() {
        assertEquals(FileNames.FALLBACK, FileNames.safe(null));
        assertEquals(FileNames.FALLBACK, FileNames.safe("   "));
        assertEquals(FileNames.FALLBACK, FileNames.safe("dir/"));
    }

    @Test
    public void longNamesKeepTheirExtension() {
        String name = FileNames.safe("a".repeat(300) + ".pdf");
        assertEquals(120, name.length());
        assertTrue(name.endsWith(".pdf"));
    }

    @Test
    public void theTypeAddsAMissingExtension() {
        assertEquals("Statement.pdf", FileNames.withExtension("Statement", "application/pdf"));
        assertEquals("Statement.pdf", FileNames.withExtension("Statement.pdf", "application/pdf"));
        assertEquals("photo.jpeg", FileNames.withExtension("photo.jpeg", "image/jpeg"));
        assertEquals("notes", FileNames.withExtension("notes", "application/octet-stream"));
    }
}
