package com.givemepic.backend.media.storage;

import org.junit.jupiter.api.Test;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.HeadBucketRequest;

import java.net.URI;

public class S3PathTest {
    @Test
    public void testS3Path() {
        S3Client s3Client = S3Client.builder()
                .endpointOverride(URI.create("https://viloijycgivaptvvzaly.storage.supabase.co/storage/v1/s3"))
                .region(Region.of("ap-northeast-2"))
                .credentialsProvider(StaticCredentialsProvider.create(AwsBasicCredentials.create("967ce5f4ae05a19589f90f58f6f34d7c", "ecbacd096c4c33025246c80fa30441af1fa8e0d59d9c1cc464111f29b0eda1ae")))
                .forcePathStyle(true)
                .build();
        
        try {
            s3Client.headBucket(HeadBucketRequest.builder().bucket("givemepic-media").build());
            System.out.println("SUCCESS");
        } catch (Exception e) {
            e.printStackTrace();
        }
    }
}
