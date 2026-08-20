package com.givemepic.backend.media.storage;

import org.springframework.web.multipart.MultipartFile;

public interface ObjectStorageService {

    void store(String objectKey, MultipartFile file);

    void delete(String objectKey);

    String createDownloadUrl(String objectKey);
}
