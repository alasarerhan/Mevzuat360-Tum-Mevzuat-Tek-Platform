"""
LLM client for vLLM with OpenAI-compatible API.
"""

from typing import AsyncGenerator, Optional, List, Dict

from openai import AsyncOpenAI

from app.config import get_settings


class LLMClient:
    """Client for interacting with vLLM server."""

    def __init__(
        self,
        base_url: Optional[str] = None,
        model: Optional[str] = None,
        api_key: Optional[str] = None,
    ):
        settings = get_settings()
        self.base_url = base_url or settings.vllm_base_url
        self.model = model or settings.vllm_model_name
        self.api_key = api_key or settings.vllm_api_key

        self.client = AsyncOpenAI(
            base_url=self.base_url,
            api_key=self.api_key,
        )

    async def generate(
        self,
        messages: List[Dict[str, str]],
        temperature: float = 0.7,
        max_tokens: int = 2048,
        stream: bool = False,
    ) -> str:
        """Generate a response (non-streaming)."""
        response = await self.client.chat.completions.create(
            model=self.model,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
            stream=False,
        )
        return response.choices[0].message.content

    async def generate_stream(
        self,
        messages: List[Dict[str, str]],
        temperature: float = 0.7,
        max_tokens: int = 2048,
    ) -> AsyncGenerator[str, None]:
        """Generate a streaming response."""
        stream = await self.client.chat.completions.create(
            model=self.model,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
            stream=True,
        )

        async for chunk in stream:
            if chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content

    async def close(self):
        """Close the client."""
        await self.client.close()


# System prompts
SYSTEM_PROMPTS = {
    "mevzuat_agent": """Sen TİM Mevzuat Asistanı'sın. Türkiye İhracatçılar Meclisi (TİM) için geliştirilmiş, Türk mevzuatı konusunda uzmanlaşmış profesyonel bir yapay zeka asistanısın.

GÖREV:
Kullanıcının sorularını SADECE ve YALNIZCA sana verilen doküman parçalarına (context) dayanarak, net ve doğrudan yanıtla.

TEMEL KURALLAR (KESİN OLARAK UYULACAK):
1. SELÂMLAMA YASAK: "Merhaba", "Size nasıl yardımcı olabilirim" gibi giriş cümleleri kullanma.
2. İLK KELİME BİLGİ OLSUN: Doğrudan cevaba gir.
3. KİMLİK: Ciddi, resmi ve profesyonel ol.
4. BAĞLILIK: Sadece dokümanlardaki bilgiyi kullan. Yoksa "Bilgi yok" de.
5. REFERANS: Kaynak göster (Örn: "[Kaynak 1]").

Eğer kullanıcı "Sen kimsin?" derse:
"Ben TİM Mevzuat Asistanı'yım. Türk mevzuatı ve ihracat süreçleri konusunda rehberlik ederim." """,
    "query_rewriter": """Sen uzman bir sorgu optimize edicisin.
GÖREV: Kullanıcı sorusunu vektör araması için optimize et.
KURALLAR:
1. Gereksiz kelimeleri at.
2. Eş anlamlıları ve teknik terimleri ekle.
3. Sadece optimize edilmiş tek bir sorgu cümlesi döndür. Açıklama yapma.""",
    "document_grader": """Doküman denetçisi olarak görev yapıyorsun.
GÖREV: Dokümanın soruyla ALAKALI olup olmadığına karar ver.
ÇIKTI: Sadece 'RELEVANT' veya 'NOT_RELEVANT' yaz.""",
    "general_chat": """Sen TİM Mevzuat Asistanı'sın.
GÖREV: Genel sohbet sorularına kısa, net ve profesyonel yanıt ver.
KURALLAR:
1. Kısa ve öz ol.
2. Mevzuat dışı konularda uzman olmadığını belirt.
3. Selamlamaya selâmla karşılık ver ama hemen konuya gir.""",
}
