// Added by MainActivity at document start, on the web app's own origin only.
// Android's WebView lacks three things a browser has; these point them at the
// app instead, so the web app needs no Android-specific code:
//   window.print()            → BangkeePrint (Android's print dialog)
//   navigator.share / canShare → BangkeeFiles.share (the share sheet, with the PDF)
//   <a download href="blob:…"> → BangkeeFiles.save (Downloads)
// Capacitor's bridge is added after this script, so it is looked up at call time.
;(function () {
  function call(plugin, method, options) {
    var cap = window.Capacitor
    if (!cap || typeof cap.nativePromise !== "function") return Promise.reject(new Error("Bangkee is not ready yet."))
    return cap.nativePromise(plugin, method, options || {})
  }

  function base64(blob) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader()
      reader.onload = function () {
        var url = String(reader.result)
        resolve(url.slice(url.indexOf(",") + 1))
      }
      reader.onerror = function () {
        reject(reader.error)
      }
      reader.readAsDataURL(blob)
    })
  }

  window.print = function () {
    call("BangkeePrint", "print").catch(function () {})
  }

  function define(name, value) {
    try {
      Object.defineProperty(navigator, name, { value: value, configurable: true, writable: true })
    } catch (e) {
      navigator[name] = value
    }
  }

  define("canShare", function (data) {
    return !!data && !!(data.files || data.text || data.url || data.title)
  })

  define("share", function (data) {
    data = data || {}
    var text = [data.text, data.url].filter(Boolean).join("\n")
    var title = data.title || ""
    var file = data.files && data.files[0]
    if (!file) return call("BangkeeFiles", "share", { text: text, title: title }).then(function () {})
    return base64(file)
      .then(function (encoded) {
        return call("BangkeeFiles", "share", { data: encoded, filename: file.name || "document", mimeType: file.type || "application/octet-stream", text: text, title: title })
      })
      .then(function () {})
  })

  // The web app downloads a document it fetched by clicking a link to its blob:
  // URL; WebView ignores that, so the click is caught here and the file saved.
  document.addEventListener(
    "click",
    function (event) {
      var link = event.target && event.target.closest ? event.target.closest("a[download]") : null
      if (!link) return
      var href = link.href || ""
      if (href.indexOf("blob:") !== 0 && href.indexOf("data:") !== 0) return
      event.preventDefault()
      var name = link.getAttribute("download") || "document"
      fetch(href)
        .then(function (response) {
          return response.blob()
        })
        .then(function (blob) {
          return base64(blob).then(function (encoded) {
            return call("BangkeeFiles", "save", { data: encoded, filename: name, mimeType: blob.type || "application/octet-stream" })
          })
        })
        .catch(function () {})
    },
    true,
  )
})()
