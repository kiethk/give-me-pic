package com.givemepic.backend.common.ratelimit;

import io.github.bucket4j.Bucket;
import io.github.bucket4j.ConsumptionProbe;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import java.util.concurrent.TimeUnit;

@Component
@RequiredArgsConstructor
public class RateLimitInterceptor implements HandlerInterceptor {

    private final RateLimitingService rateLimitingService;

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws Exception {
        String uri = request.getRequestURI();
        
        RateLimitingService.ActionType actionType = null;
        if (uri.startsWith("/api/media/upload") && request.getMethod().equalsIgnoreCase("POST")) {
            actionType = RateLimitingService.ActionType.UPLOAD;
        } else if (uri.startsWith("/api/chat") && request.getMethod().equalsIgnoreCase("POST")) {
            actionType = RateLimitingService.ActionType.CHAT;
        }

        if (actionType != null) {
            Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
            if (authentication == null || !authentication.isAuthenticated() || "anonymousUser".equals(authentication.getPrincipal())) {
                return true; // Let auth filter handle unauthenticated requests
            }
            
            // Assuming the principal is the userId (as set in JwtAuthFilter)
            String userId = authentication.getName();
            if (userId == null) {
                return true;
            }

            Bucket bucket = rateLimitingService.resolveBucket(userId, actionType);
            ConsumptionProbe probe = bucket.tryConsumeAndReturnRemaining(1);
            
            if (!probe.isConsumed()) {
                long waitForRefill = probe.getNanosToWaitForRefill();
                long waitForRefillSeconds = TimeUnit.NANOSECONDS.toSeconds(waitForRefill);
                
                response.setStatus(HttpStatus.TOO_MANY_REQUESTS.value());
                response.setHeader("Retry-After", String.valueOf(waitForRefillSeconds));
                response.setContentType("application/json");
                response.getWriter().write("{\"message\": \"Too many requests. Please try again later.\"}");
                return false;
            }
        }
        
        return true;
    }
}
