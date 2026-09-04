package com.givemepic.backend.media.storage;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.*;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.s3.presigner.model.GetObjectPresignRequest;
import software.amazon.awssdk.services.s3.presigner.model.PresignedGetObjectRequest;
import software.amazon.awssdk.services.s3.presigner.model.PutObjectPresignRequest;
import software.amazon.awssdk.services.s3.presigner.model.PresignedPutObjectRequest;

import java.net.URI;
import java.time.Duration;

@Service
public class AwsS3StorageService implements ObjectStorageService {

    private final S3Client s3Client;
    private final S3Presigner s3Presigner;
    private final String bucket;
    private final int presignedUrlExpirySeconds;
    private final String internalEndpoint;
    private final String publicEndpoint;
    private volatile boolean bucketReady;

    public AwsS3StorageService(
            @Value("${app.storage.endpoint}") String endpoint,
            @Value("${app.storage.region:us-east-1}") String region,
            @Value("${app.storage.public-endpoint:}") String publicEndpoint,
            @Value("${app.storage.access-key}") String accessKey,
            @Value("${app.storage.secret-key}") String secretKey,
            @Value("${app.storage.bucket}") String bucket,
            @Value("${app.storage.presigned-url-expiry-seconds:3600}") int presignedUrlExpirySeconds) {

        AwsBasicCredentials credentials = AwsBasicCredentials.create(accessKey, secretKey);
        Region awsRegion = Region.of(region);
        URI endpointUri = URI.create(endpoint);

        this.s3Client = S3Client.builder()
                .endpointOverride(endpointUri)
                .region(awsRegion)
                .credentialsProvider(StaticCredentialsProvider.create(credentials))
                .forcePathStyle(true)
                .build();

        this.s3Presigner = S3Presigner.builder()
                .endpointOverride(endpointUri)
                .region(awsRegion)
                .credentialsProvider(StaticCredentialsProvider.create(credentials))
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
            PutObjectRequest putObjectRequest = PutObjectRequest.builder()
                    .bucket(bucket)
                    .key(objectKey)
                    .contentType(file.getContentType() == null ? "application/octet-stream" : file.getContentType())
                    .build();

            s3Client.putObject(putObjectRequest, RequestBody.fromBytes(file.getBytes()));
        } catch (Exception ex) {
            throw new IllegalStateException("Không thể upload object lên S3 Storage", ex);
        }
    }

    @Override
    public void delete(String objectKey) {
        try {
            DeleteObjectRequest deleteObjectRequest = DeleteObjectRequest.builder()
                    .bucket(bucket)
                    .key(objectKey)
                    .build();

            s3Client.deleteObject(deleteObjectRequest);
        } catch (Exception ex) {
            throw new IllegalStateException("Không thể xóa object khỏi S3 Storage", ex);
        }
    }

    @Override
    public byte[] download(String objectKey) {
        try {
            GetObjectRequest getObjectRequest = GetObjectRequest.builder()
                    .bucket(bucket)
                    .key(objectKey)
                    .build();

            return s3Client.getObjectAsBytes(getObjectRequest).asByteArray();
        } catch (Exception ex) {
            throw new IllegalStateException("Không thể tải object từ S3 Storage", ex);
        }
    }

    @Override
    public String createDownloadUrl(String objectKey) {
        try {
            GetObjectRequest getObjectRequest = GetObjectRequest.builder()
                    .bucket(bucket)
                    .key(objectKey)
                    .build();

            GetObjectPresignRequest getObjectPresignRequest = GetObjectPresignRequest.builder()
                    .signatureDuration(Duration.ofSeconds(presignedUrlExpirySeconds))
                    .getObjectRequest(getObjectRequest)
                    .build();

            PresignedGetObjectRequest presignedGetObjectRequest = s3Presigner.presignGetObject(getObjectPresignRequest);
            String url = presignedGetObjectRequest.url().toString();

            // Rewrite internal endpoint to public endpoint so LAN/internet clients can access the URL.
            if (publicEndpoint != null && url.startsWith(internalEndpoint)) {
                url = publicEndpoint + url.substring(internalEndpoint.length());
            }
            return url;
        } catch (Exception ex) {
            throw new IllegalStateException("Không thể tạo download URL từ S3 Storage", ex);
        }
    }

    @Override
    public String createPresignedPutUrl(String objectKey, String contentType) {
        ensureBucket();
        try {
            PutObjectRequest putObjectRequest = PutObjectRequest.builder()
                    .bucket(bucket)
                    .key(objectKey)
                    .contentType(contentType == null ? "application/octet-stream" : contentType)
                    .build();

            PutObjectPresignRequest putObjectPresignRequest = PutObjectPresignRequest.builder()
                    .signatureDuration(Duration.ofSeconds(presignedUrlExpirySeconds))
                    .putObjectRequest(putObjectRequest)
                    .build();

            PresignedPutObjectRequest presignedPutObjectRequest = s3Presigner.presignPutObject(putObjectPresignRequest);
            String url = presignedPutObjectRequest.url().toString();

            // Rewrite internal endpoint to public endpoint so LAN/internet clients can access the URL.
            if (publicEndpoint != null && url.startsWith(internalEndpoint)) {
                url = publicEndpoint + url.substring(internalEndpoint.length());
            }
            return url;
        } catch (Exception ex) {
            throw new IllegalStateException("Không thể tạo upload URL từ S3 Storage", ex);
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
                HeadBucketRequest headBucketRequest = HeadBucketRequest.builder().bucket(bucket).build();
                try {
                    s3Client.headBucket(headBucketRequest);
                    bucketReady = true;
                } catch (NoSuchBucketException e) {
                    CreateBucketRequest createBucketRequest = CreateBucketRequest.builder().bucket(bucket).build();
                    s3Client.createBucket(createBucketRequest);
                    bucketReady = true;
                }
            } catch (Exception ex) {
                // If there's an error (e.g. 403) we ignore and let the store operation fail if necessary
                bucketReady = true; 
            }
        }
    }
}
