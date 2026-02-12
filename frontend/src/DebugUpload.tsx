import { useState } from "react";

function DebugUpload() {
  const [result, setResult] = useState("");

  const testUpload = async () => {
    const formData = new FormData();
    const blob = new Blob(["test content"], { type: "text/plain" });
    const file = new File([blob], "test.txt", { type: "text/plain" });

    formData.append("file", file);
    formData.append("temporary", "false");

    console.log("FormData entries:");
    for (let [key, value] of formData.entries()) {
      console.log(key, value);
    }

    try {
      const response = await fetch("http://localhost:8000/api/documents/upload", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();
      setResult(JSON.stringify(data, null, 2));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setResult(message);
    }
  };

  return (
    <div>
      <button onClick={testUpload}>Test Upload</button>
      <pre>{result}</pre>
    </div>
  );
}

export default DebugUpload;
