# Local PII Filter

Small browser app for detecting and redacting PII with `openai/privacy-filter` through Transformers.js.

## Run

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. Inference runs locally in the browser using WebGPU when available, with a CPU/WASM fallback.

## Static deployment with cached model files

To deploy without downloading model files from Hugging Face at runtime, cache the quantized ONNX model into `public/models/openai/privacy-filter` before building:

```bash
npm run cache:model
npm run build
```

Or run both steps:

```bash
npm run build:static
```

Deploy the generated `dist` folder to your storage account.

For Azure Storage static website hosting, upload the contents of `dist` into the `$web` container. The app expects the model at the website root under:

```text
/models/openai/privacy-filter
```

If you upload the model manually, the `$web` container should contain this structure:

```text
$web/
  index.html
  assets/
    ...
  models/
    openai/
      privacy-filter/
        config.json
        tokenizer.json
        tokenizer_config.json
        viterbi_calibration.json
        onnx/
          model_q4.onnx
          model_q4.onnx_data
```

You can use the included helper after `az login`:

```bash
npm run build:static
npm run deploy:azure -- -AccountName <storage-account-name>
```

Or build and deploy in one command if the model is already cached:

```bash
npm run deploy:azure -- -AccountName <storage-account-name> -Build
```

The cached model files are large. The q4 ONNX data file is roughly 900 MB, so make sure the storage account allows large static assets and serves:

- `.onnx` as `application/octet-stream`
- `.onnx_data` as `application/octet-stream`
- `.wasm` as `application/wasm`
- `.json` as `application/json`

For a strict deployment that never falls back to Hugging Face, build with:

```bash
$env:VITE_LOCAL_MODEL_ONLY="true"
npm run build
```

## Embedding in another page

The app detects when it is loaded inside an iframe and switches to a compact embed layout (no footer, slim header). It also posts its content height to the parent window so the host page can resize the iframe to fit. Aspect-ratio container tricks like `padding-top: 120%` should be avoided on mobile because the resulting iframe height can collapse — use the snippet below instead and let the iframe grow to its content.

```html
<iframe
  id="prismia-pii"
  src="https://your-deployment.example.com/"
  title="Local PII Filter"
  loading="lazy"
  referrerpolicy="no-referrer"
  allow="clipboard-read; clipboard-write"
  style="width: 100%; height: 720px; border: 0; display: block;"
></iframe>
<script>
  window.addEventListener("message", function (event) {
    var data = event.data;
    if (!data || data.type !== "prismia:resize") return;
    var iframe = document.getElementById("prismia-pii");
    if (iframe && typeof data.height === "number") {
      iframe.style.height = data.height + "px";
    }
  });
</script>
```

The app sends `{ type: "prismia:resize", height: <number> }` to `window.parent` whenever its content height changes.

## Notes

- Pasted text is not sent to a hosted inference API by this app.
- If `VITE_LOCAL_MODEL_ONLY` is not set, Transformers.js checks the local static model path first and may fall back to Hugging Face if files are missing.
- The model is a privacy aid, not a compliance guarantee. Review high-sensitivity output manually.
