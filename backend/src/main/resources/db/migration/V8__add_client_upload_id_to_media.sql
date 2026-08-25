ALTER TABLE media_files
    ADD COLUMN client_upload_id UUID UNIQUE;