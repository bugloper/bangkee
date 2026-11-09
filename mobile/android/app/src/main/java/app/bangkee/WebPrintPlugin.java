package app.bangkee;

import android.content.Context;
import android.print.PrintAttributes;
import android.print.PrintManager;
import android.webkit.WebView;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * window.print() for the WebView, which otherwise ignores it. A customer's statement
 * (web/src/routes/_app/accounts/$id/statement.tsx) has a Print button that calls it;
 * MainActivity points window.print at this plugin, which opens Android's print dialog
 * (print to a printer, or "Save as PDF") for the page as it is on screen, so the web
 * app's print styles apply.
 */
@CapacitorPlugin(name = "BangkeePrint")
public class WebPrintPlugin extends Plugin {

    @PluginMethod
    public void print(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            PrintManager printManager = (PrintManager) getContext().getSystemService(Context.PRINT_SERVICE);
            WebView webView = getBridge().getWebView();
            if (printManager == null || webView == null) {
                call.reject("Printing is not available on this phone.");
                return;
            }
            String jobName = getContext().getString(R.string.print_job_name);
            printManager.print(jobName, webView.createPrintDocumentAdapter(jobName), new PrintAttributes.Builder().build());
            call.resolve();
        });
    }
}
