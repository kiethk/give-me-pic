package com.givemepic.backend.common.ratelimit;

import io.github.bucket4j.Bandwidth;
import io.github.bucket4j.Bucket;
import io.github.bucket4j.Refill;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class RateLimitingService {

    public enum ActionType {
        UPLOAD,
        CHAT
    }

    // Stores buckets per user per action type
    // Format of key: "userId:actionType"
    private final Map<String, Bucket> cache = new ConcurrentHashMap<>();

    public Bucket resolveBucket(String userId, ActionType actionType) {
        String key = userId + ":" + actionType.name();
        return cache.computeIfAbsent(key, k -> newBucket(actionType));
    }

    private Bucket newBucket(ActionType actionType) {
        return switch (actionType) {
            case UPLOAD -> {
                // 50 requests per hour
                Bandwidth limit = Bandwidth.classic(50, Refill.intervally(50, Duration.ofHours(1)));
                yield Bucket.builder().addLimit(limit).build();
            }
            case CHAT -> {
                // 50 requests per hour
                Bandwidth limit = Bandwidth.classic(50, Refill.intervally(50, Duration.ofHours(1)));
                yield Bucket.builder().addLimit(limit).build();
            }
        };
    }
}
