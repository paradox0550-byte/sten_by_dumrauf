# STEN document pipeline

STEN must distinguish **analysis** from **storage**.

## User flow

1. User attaches Excel, Word, PDF, CSV or image.
2. Backend validates and extracts content.
3. STEN shows what was actually extracted and where it came from.
4. STEN analyses the content together with the selected project/branch/restaurant scope.
5. STEN asks whether to save the source document.
6. If the user chooses Save, the original is persisted and indexed.
7. If the user declines, the analysis can remain in the conversation, but the source is not added to the permanent document base.
8. If a table was extracted or normalized, STEN can generate an XLSX for download. The generated workbook must identify source file, sheet/page and any extraction warnings.

## Image and Word support

Image support requires server-side OCR/vision processing. DOCX requires server-side document parsing. The frontend must not pretend these capabilities exist merely because a file picker accepts the extension.

## Safety

- original source is immutable;
- derived XLSX is a separate artifact;
- provenance is preserved;
- unsupported/low-confidence extraction is reported;
- no guessed values;
- no automatic permanent save.
