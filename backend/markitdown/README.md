# STEN MarkItDown converter

This is the isolated document-conversion function used by STEN AI.

Flow:

`STEN upload → Node API → MarkItDown function → normalized Markdown → STEN evidence pipeline → YandexGPT`

The service is intentionally not exposed to the browser.

## Runtime

- Yandex Cloud Functions
- Python 3.12
- MarkItDown 0.1.8

## HTTP contract

POST JSON:

`{ "name": "...", "mimeType": "...", "dataBase64": "..." }`

Response:

`{ "markdown": "...", "engine": "markitdown", "engineVersion": "0.1.8", "sourceFormat": "...", "warnings": [] }`

Optional bearer authentication is controlled by `MARKITDOWN_TOKEN`.

## Deploy

Create a separate Yandex Cloud Function using `backend/markitdown/function.py` as entry point `function.handler`, Python 3.12. Add `requirements.txt` from this directory.

Set the same `MARKITDOWN_TOKEN` value in the converter and STEN backend. Do not put the token in frontend code or commit its value.

The STEN backend receives the converter URL through `MARKITDOWN_URL`.
