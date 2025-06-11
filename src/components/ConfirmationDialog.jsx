import React from 'react';
import Modal from './Modal'; 
import { XCircle } from 'lucide-react';

const ConfirmationDialog = ({ isOpen, onClose, onConfirm, title, message }) => { 
    if (!isOpen) return null;
    return (
        <Modal isOpen={isOpen} onClose={onClose} title={title} size="md">
        <p className="text-gray-700 mb-6">{message}</p>
        <div className="flex justify-end space-x-3">
            <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
            >
            キャンセル
            </button>
            <button
            onClick={onConfirm}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
            >
            削除
            </button>
        </div>
        </Modal>
    );
};

export default ConfirmationDialog;
