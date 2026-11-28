package com.givemepic.backend.common.exception;

/**
 * Exception thrown when a user exceeds a monthly usage or storage quota.
 */
public class QuotaExceededException extends RuntimeException {

    private final String quotaType;

    public QuotaExceededException(String quotaType, String message) {
        super(message);
        this.quotaType = quotaType;
    }

    public String getQuotaType() {
        return quotaType;
    }
}
