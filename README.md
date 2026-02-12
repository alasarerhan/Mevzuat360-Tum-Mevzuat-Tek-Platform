# Legislation Agent (AI-Powered Regulatory Assistant)

Legislation Agent is an advanced **Agentic RAG (Retrieval-Augmented Generation)** assistant built on **LangGraph**. It is designed to analyze, search, and answer complex questions regarding any set of regulatory documents, laws, or institutional guidelines.

By leveraging an agentic workflow, the system ensures high accuracy by grading retrieved documents, rewriting queries for better retrieval, and providing transparent citations for every response.

---

## 🌟 Key Features

-   **Agentic Workflow:** Powered by LangGraph to handle query classification, document relevance grading, and iterative query rewriting.
-   **Hybrid Search:** Combines semantic vector search with keyword-based BM25 search via MongoDB Atlas for superior retrieval performance.
-   **Transparent Citations:** Every AI-generated answer includes direct references to the source documents, ensuring reliability and traceability.
-   **Conversational Memory:** Maintains context across multiple turns using MongoDB-backed persistent chat history.
-   **Flexible LLM Backend:** Supports local execution via **Ollama** or server-side deployment using **vLLM** (Gemma, Qwen, Llama, etc.).
-   **Modern UI:** A sleek, responsive dashboard built with React, TypeScript, Tailwind CSS, and Shadcn UI.

---

## 🏗️ Architecture & Tech Stack

### Backend
-   **FastAPI:** Asynchronous Python web framework for high-performance API delivery.
-   **LangGraph & LangChain:** Orchestrates the Agentic RAG logic and complex workflows.
-   **MongoDB & Motor:** Asynchronous storage for documents, embeddings, and chat history.
-   **Ollama / vLLM:** Providers for Large Language Models and Embedding services.

### Frontend
-   **React (Vite):** Modern frontend development with fast HMR.
-   **TypeScript:** Type-safety for robust application state management.
-   **Tailwind CSS & Shadcn UI:** For a clean, professional, and accessible user interface.
-   **Lucide React:** Iconography suite.

---

## ⚙️ Setup & Configuration

### Prerequisites
-   **Python 3.11+**
-   **Node.js 18+**
-   **MongoDB** (Community Server or Atlas)

### 1. Environment Variables (.env)

Create a `.env` file in the `backend` directory based on the template below:

```env
# MongoDB Configuration
MONGODB_URI="your-mongodb-connection-string"
MONGODB_DATABASE="your-database-name"

# LLM Service (Ollama or vLLM)
VLLM_BASE_URL="your-llm-service-base-url"
VLLM_MODEL_NAME="your-model-name"
VLLM_API_KEY="your-api-key-if-required"

# Embedding Service
EMBEDDING_BASE_URL="your-embedding-service-base-url"
EMBEDDING_MODEL="your-embedding-model-name"
EMBEDDING_DIMENSION=your-embedding-dimension
```

### 2. Backend Installation

```bash
cd backend
python -m venv venv

# Windows:
venv\Scripts\activate
# Mac/Linux:
source venv/bin/activate

pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### 3. Frontend Installation

```bash
cd frontend
npm install
npm run dev
```

---

## 🚀 Execution Scenarios

### Scenario A: Local Development (Ollama)
1.  Ensure Ollama is running on your machine.
2.  Pull the required models:
    ```bash
    ollama pull your-llm-model
    ollama pull your-embedding-model
    ```
3.  Start the Backend and Frontend using the steps above.

### Scenario B: Production / Server (vLLM)
1.  Configure the `VLLM_BASE_URL` in your `.env` to point to your GPU server.
2.  Ensure your MongoDB instance is accessible from the application host.

---

## 📖 Usage Guide

1.  **Document Management:** Navigate to the "Library" or "Upload" section to index your regulatory PDF files. The system will automatically chunk and vectorize the content.
2.  **Ask Questions:** Use the chat interface to ask questions like *"What is the procedure for X under the current regulations?"*
3.  **Verify Sources:** Click on the citation icons next to the AI's response to view the exact document snippet used to generate the answer.

---

## 🤝 Contributing

1. Fork the repository.
2. Create a feature branch (`git checkout -b feature/AmazingFeature`).
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`).
4. Push to the branch (`git push origin feature/AmazingFeature`).
5. Open a Pull Request.

---

## 📄 License
Distributed under the MIT License. See `LICENSE` for more information.
