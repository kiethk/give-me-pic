package com.givemepic.backend.media.storage;

import io.minio.BucketExistsArgs;
import io.minio.GetPresignedObjectUrlArgs;
import io.minio.GetObjectArgs;
import io.minio.MakeBucketArgs;
import io.minio.MinioClient;
import io.minio.PutObjectArgs;
import io.minio.RemoveObjectArgs;
import io.minio.http.Method;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.util.concurrent.TimeUnit;

@Service
public class MinioStorageService implements ObjectStorageService {

    private final MinioClient minioClient;
    private final String bucket;
    private final int presignedUrlExpirySeconds;
    private final String internalEndpoint;   // e.g. http://localhost:9000
    private final String publicEndpoint;     // e.g. http://192.168.1.23:9000 (optional)
    private volatile boolean bucketReady;

    public MinioStorageService(
            @Value("${app.storage.endpoint}") String endpoint,
            @Value("${app.storage.region:us-east-1}") String region,
            @Value("${app.storage.public-endpoint:}") String publicEndpoint,
            @Value("${app.storage.access-key}") String accessKey,
            @Value("${app.storage.secret-key}") String secretKey,
            @Value("${app.storage.bucket}") String bucket,
            @Value("${app.storage.presigned-url-expiry-seconds:3600}") int presignedUrlExpirySeconds) {
        this.minioClient = MinioClient.builder()
                .endpoint(endpoint)
                .region(region)
                .credentials(accessKey, secretKey)
                .build();
        this.bucket = bucket;
        this.presignedUrlExpirySeconds = presignedUrlExpirySeconds;
        this.internalEndpoint = endpoint.replaceAll("/+$", "");
        this.publicEndpoint = (publicEndpoint == null || publicEndpoint.isBlank())
                ? null
                : publicEndpoint.replaceAll("/+$", "");
    }

    @Override
    public void store(String objectKey, MultipartFile file) {
        ensureBucket();

        try {
            minioClient.putObject(PutObjectArgs.builder()
                    .bucket(bucket)
                    .object(objectKey)
                    .stream(file.getInputStream(), file.getSize(), -1)
                    .contentType(file.getContentType() == null ? "application/octet-stream" : file.getContentType())
                    .build());
        } catch (Exception ex) {
            throw new IllegalStateException("Không thể upload object lên MinIO", ex);
        }
    }

    @Override
    public void delete(String objectKey) {
        try {
            minioClient.removeObject(RemoveObjectArgs.builder()
                    .bucket(bucket)
                    .object(objectKey)
                    .build());
        } catch (Exception ex) {
            throw new IllegalStateException("Không thể xóa object khỏi MinIO", ex);
        }
    }

    @Override
    public byte[] download(String objectKey) {
        try (var inputStream = minioClient.getObject(GetObjectArgs.builder()
                .bucket(bucket)
                .object(objectKey)
                .build())) {
            return inputStream.readAllBytes();
        } catch (Exception ex) {
            throw new IllegalStateException("Không thể tải object từ MinIO", ex);
        }
    }

    @Override
    public String createDownloadUrl(String objectKey) {
        try {
            String url = minioClient.getPresignedObjectUrl(GetPresignedObjectUrlArgs.builder()
                    .method(Method.GET)
                    .bucket(bucket)
                    .object(objectKey)
                    .expiry(presignedUrlExpirySeconds, TimeUnit.SECONDS)
                    .build());
            // Rewrite internal endpoint to public endpoint so LAN/internet clients can access the URL.
            if (publicEndpoint != null && url.startsWith(internalEndpoint)) {
                url = publicEndpoint + url.substring(internalEndpoint.length());
            }
            return url;
        } catch (Exception ex) {
            throw new IllegalStateException("Không thể tạo download URL từ MinIO", ex);
        }
    }

    private void ensureBucket() {
        if (bucketReady) {
            return;
        }

        synchronized (this) {
            if (bucketReady) {
                return;
            }

            try {
                boolean exists = minioClient.bucketExists(BucketExistsArgs.builder().bucket(bucket).build());
                if (!exists) {
                    minioClient.makeBucket(MakeBucketArgs.builder().bucket(bucket).build());
                }
                bucketReady = true;
            } catch (Exception ex) {
                throw new IllegalStateException("Không thể khởi tạo bucket MinIO", ex);
            }
        }
    }
}
