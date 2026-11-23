package com.givemepic.backend.media.service;

import java.util.function.Consumer;

public interface LlmProvider {

    String modelName();

    String generateAnswer(String prompt);

    void streamAnswer(String prompt, Consumer<String> onChunk, Runnable onComplete, Consumer<Throwable> onError);
}
