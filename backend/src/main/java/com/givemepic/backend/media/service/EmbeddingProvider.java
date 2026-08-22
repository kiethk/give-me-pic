package com.givemepic.backend.media.service;

import java.util.List;

public interface EmbeddingProvider {

    String modelName();

    List<Float> embed(String text);
}
