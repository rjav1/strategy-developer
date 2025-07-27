import React, { useState } from 'react';
import FileUploader from '../components/FileUploader';

export default function DataUpload() {
  const [parsedData, setParsedData] = useState<Record<string, string>[]>([]);

  const hasData = Array.isArray(parsedData) && parsedData.length > 0 && typeof parsedData[0] === 'object';

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Upload Your Data</h1>
      <FileUploader onFileParsed={setParsedData} />
      {hasData ? (
        <React.Fragment key="table-preview">
          <div className="mt-6 overflow-auto max-h-[300px]">
            <table className="min-w-full text-sm text-left border mt-4">
              <thead className="bg-gray-200">
                <tr>
                  {Object.keys(parsedData[0]).map((key) => (
                    <th key={key} className="px-3 py-2 border">{key}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {parsedData.map((row, i) => (
                  <tr key={i}>
                    {Object.values(row).map((val, j) => (
                      <td key={j} className="px-3 py-1 border">{String(val)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </React.Fragment>
      ) : null}
    </div>
  );
} 