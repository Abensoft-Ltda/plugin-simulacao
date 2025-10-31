import React from 'react';

interface SuccessAnimationProps {
    show: boolean;
    text: string;
}

const SuccessAnimation: React.FC<SuccessAnimationProps> = ({ show, text }) => {
    if (!show) return null;

    return (
        <div className="absolute inset-0 bg-green-500 flex items-center justify-center z-[9999] transition-opacity duration-500 ease-in-out">
            <div className="text-center text-white">
                <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center mx-auto mb-4 transform transition-all duration-700 ease-out scale-110 animate-pulse">
                    <svg className="w-10 h-10 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                </div>
                <p className="text-lg font-medium transform transition-all duration-500 ease-out translate-y-0">{text}</p>
            </div>
        </div>
    );
};

export default SuccessAnimation;