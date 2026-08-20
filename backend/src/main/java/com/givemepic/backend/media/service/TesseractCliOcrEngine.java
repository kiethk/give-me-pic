package com.givemepic.backend.media.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.concurrent.TimeUnit;

@Service
public class TesseractCliOcrEngine implements OcrEngine {

    private final String command;
    private final String languages;
    private final long timeoutSeconds;

    public TesseractCliOcrEngine(
            @Value("${app.ocr.tesseract-command:tesseract}") String command,
            @Value("${app.ocr.languages:eng}") String languages,
            @Value("${app.ocr.timeout-seconds:60}") long timeoutSeconds) {
        this.command = command;
        this.languages = languages;
        this.timeoutSeconds = timeoutSeconds;
    }

    @Override
    public String name() {
        return "tesseract";
    }

    @Override
    public String extractText(byte[] content, String contentType, String fileName) {
        String suffix = suffixFor(contentType, fileName);
        Path inputFile = null;

        try {
            inputFile = Files.createTempFile("givemepic-ocr-", suffix);
            Files.write(inputFile, content);

            Process process = new ProcessBuilder(command, inputFile.toString(), "stdout", "-l", languages)
                    .redirectErrorStream(true)
                    .start();
            if (!process.waitFor(timeoutSeconds, TimeUnit.SECONDS)) {
                process.destroyForcibly();
                throw new IllegalStateException("OCR process vượt quá thời gian cho phép");
            }

            String output = new String(process.getInputStream().readAllBytes());
            if (process.exitValue() != 0) {
                throw new IllegalStateException("OCR process thất bại: " + output.trim());
            }
            return output.trim();
        } catch (IOException ex) {
            throw new IllegalStateException("Không thể chạy Tesseract OCR", ex);
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("OCR process bị gián đoạn", ex);
        } finally {
            if (inputFile != null) {
                try {
                    Files.deleteIfExists(inputFile);
                } catch (IOException ignored) {
                }
            }
        }
    }

    private String suffixFor(String contentType, String fileName) {
        if (contentType != null && contentType.contains("png")) {
            return ".png";
        }
        if (contentType != null && contentType.contains("webp")) {
            return ".webp";
        }
        if (fileName != null && fileName.contains(".")) {
            return fileName.substring(fileName.lastIndexOf('.'));
        }
        return ".img";
    }
}
