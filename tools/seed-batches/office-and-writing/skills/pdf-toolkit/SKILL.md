---
name: pdf-toolkit
description: 用开源工具处理 PDF：合并、拆分、旋转、压缩、提取文字/图片、加水印。用户描述需求和操作系统时使用。
license: MIT
---

# PDF 文档处理

用开源命令行工具完成 PDF 合并、拆分、旋转、压缩、提取文字与图片、加水印，给出可直接复制运行的命令。

## 工作流程

1. 确认需求与操作系统（Windows / macOS / Linux），以及是否可以安装软件。
2. 首选 qpdf（合并、拆分、旋转、解密已知密码的文件）：例如 `qpdf --empty --pages a.pdf b.pdf -- out.pdf`；拆分 `qpdf in.pdf --split-pages=1 out-%d.pdf`。
3. 压缩扫描件用 Ghostscript：`gs -sDEVICE=pdfwrite -dPDFSETTINGS=/ebook -o out.pdf in.pdf`。
4. 提取文字用 Poppler 的 `pdftotext -layout in.pdf out.txt`；提取图片 `pdfimages -png in.pdf img`。
5. 需要脚本批量处理时，给出使用 pypdf 的 Python 脚本（合并、拆分、加水印）。
6. 每个命令说明输入输出文件与安装方式（winget / brew / apt）。

## 输出

可复制运行的命令或 Python 脚本，附安装方法与预期结果。

## 注意事项

- 只处理用户有权处理的文件；不提供破解他人加密 PDF 的方法。
- 扫描件提取文字需要 OCR（如 Tesseract / ocrmypdf），先说明这一点。
- 处理前提醒备份原文件。
