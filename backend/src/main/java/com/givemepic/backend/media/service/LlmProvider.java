package com.givemepic.backend.media.service;

public interface LlmProvider {

    String modelName();

    String generateAnswer(String prompt);
}