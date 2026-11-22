package com.givemepic.backend.auth.service;

import com.givemepic.backend.auth.dto.GoogleTokenPayload;

public interface GoogleTokenVerifier {
    GoogleTokenPayload verify(String idToken);
}
