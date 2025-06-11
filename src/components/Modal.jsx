import React from 'react';
import { XCircle } from 'lucide-react';

const Modal = ({ isOpen, onClose, title, children, size = "3xl" }) => { 
  if (!isOpen) return null;
  const sizeClasses = {
    "sm": "max-w-sm", "md": "max-w-md", "lg": "max-w-lg", "xl": "max-w-xl",
    "2xl": "max-w-2xl", "3xl": "max-w-3xl", "4xl": "max-w-4xl", "5xl": "max-w-5xl", "6xl": "max-w-6xl", "7xl": "max-w-7xl"
  }
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex justify-center items-center z-50 p-4">
      <div className={`bg-white p-6 rounded-lg shadow-xl w-full ${sizeClasses[size]} max-h-[90vh] overflow-y-auto`}>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-800">{title}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <XCircle size={24} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
};

export default Modal;
