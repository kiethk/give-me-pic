package com.givemepic.backend.auth.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record UpdateProfileRequest(
        @NotBlank(message = "Tên hiển thị không được để trống")
        @Size(max = 100, message = "Tên hiển thị không được vượt quá 100 ký tự")
        String displayName,
        
        @Size(max = 500, message = "URL ảnh đại diện quá dài")
        String avatarUrl
) {}
