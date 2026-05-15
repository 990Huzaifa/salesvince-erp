import { Injectable } from '@nestjs/common';
import * as multer from 'multer';
import { diskStorage } from 'multer';
import { extname } from 'path';

@Injectable()
export class FileUploadService {
    storage = diskStorage({
        destination: './uploads', // directory to store files
        filename: (req, file, callback) => {
            const filename = `${Date.now()}${extname(file.originalname)}`;
            callback(null, filename);
        },
    });

    fileFilter(req, file, callback) {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif']; // acceptable file types
        if (!allowedTypes.includes(file.mimetype)) {
            return callback(new Error('Invalid file type'), false);
        }
        callback(null, true);
    }

    multerConfig = {
        storage: this.storage,
        fileFilter: this.fileFilter,
        limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB max size
    };
}