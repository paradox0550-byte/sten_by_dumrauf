# Skill: Document Intelligence

Goal: STEN accepts real business files, extracts evidence, and lets the user decide whether the source becomes a stored document.

Supported target inputs:
- XLSX/XLSM/CSV
- PDF
- DOCX
- JPG/JPEG/PNG and other supported image formats

Pipeline:
1. upload to backend;
2. validate MIME, size, checksum and file type;
3. extract text/tables/OCR server-side;
4. return an evidence preview with page/sheet/cell provenance;
5. STEN analyses the extracted evidence;
6. explicitly ask: "Сохранить документ в базу?" with Save / Do not save;
7. only Save creates persistent document/index/chunks;
8. optionally generate a normalized XLSX from extracted tabular data;
9. generated XLSX must carry source references and extraction warnings.

Analysis-only files are temporary and must not silently enter the permanent document store.
Never claim OCR/table extraction succeeded without backend evidence.
