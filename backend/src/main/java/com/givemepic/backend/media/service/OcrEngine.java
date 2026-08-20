package com.givemepic.backend.media.service;

public interface OcrEngine {

    String name();

    String extractText(byte[] content, String contentType, String fileName);
}
