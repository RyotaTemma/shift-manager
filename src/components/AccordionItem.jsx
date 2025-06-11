import React from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

const AccordionItem = ({ title, children, isOpen, onToggle }) => (
    <div className="border-b">
        <button
            onClick={onToggle}
            className="flex justify-between items-center w-full py-3 px-1 text-left text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none"
        >
            <span>{title}</span>
            {isOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
        </button>
        {isOpen && <div className="p-3 bg-gray-50">{children}</div>}
    </div>
);

export default AccordionItem;
