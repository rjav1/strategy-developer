import React, { useRef } from 'react';

interface FileUploaderProps {
  onFileParsed: (data: Record<string, string>[]) => void;
}

export default function FileUploader({ onFileParsed }: FileUploaderProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handleFile = async (file: File) => {
    const text = await file.text();
    const rows = text.split("\n").map(row => row.split(","));
    const headers = rows[0];
    const data: Record<string, string>[] = rows.slice(1).map(row =>
      Object.fromEntries(row.map((value, index) => [headers[index], value])) as Record<string, string>
    );
    onFileParsed(data);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  return (
    <div className="border-2 border-dashed p-6 text-center rounded-lg bg-gray-50">
      <p className="mb-2">Upload CSV file</p>
      <input
        ref={inputRef}
        type="file"
        accept=".csv"
        onChange={handleChange}
        className="hidden"
      />
      <button
        className="px-4 py-2 bg-blue-600 text-white rounded"
        onClick={() => inputRef.current?.click()}
      >
        Select File
      </button>
    </div>
  );
} 