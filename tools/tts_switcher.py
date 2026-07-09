"""
Ordkollen – TTS "smart switcher" (offline/premium generering)
==============================================================
Skriv koden en gång. Med USE_ELEVENLABS = False används gratis Edge-TTS
(Microsoft) för obegränsad testning. Sätt True för den premium ElevenLabs-röst
du valt. Detta körs på DIN dator / en server – inte i den statiska webbappen
(webbläsaren kan inte köra Python). I appen sköts växlingen av tts-engine.js.

Installera:  pip install edge-tts elevenlabs
Kör:         python tools/tts_switcher.py
"""
import asyncio
from edge_tts import Communicate
from elevenlabs.client import ElevenLabs

# ==========================================
# CONFIGURATION ZONE
# ==========================================
# True = premium ElevenLabs-röst (drar credits). False = 100% gratis Edge-TTS.
USE_ELEVENLABS = False

# Dina API-uppgifter
ELEVENLABS_API_KEY = "YOUR_ELEVENLABS_API_KEY"
ELEVENLABS_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"  # byt till ditt röst-ID

# Gratis Microsoft Edge-röst för test
# 'sv-SE-MattiasNeural' (svensk man) eller 'en-US-BrianNeural' (engelsk man)
FREE_EDGE_VOICE = "sv-SE-MattiasNeural"

TEXT_TO_SPEAK = "Hej! Detta är ett test av röstsystemet."
OUTPUT_FILE = "final_speech_output.mp3"


async def generate_voice():
    if USE_ELEVENLABS:
        print("Använder premium ElevenLabs API (drar credits)...")
        try:
            client = ElevenLabs(api_key=ELEVENLABS_API_KEY)
            audio_generator = client.generate(
                text=TEXT_TO_SPEAK,
                voice=ELEVENLABS_VOICE_ID,
                model="eleven_turbo_v2_5",  # Turbo sparar credits
            )
            with open(OUTPUT_FILE, "wb") as f:
                f.write(b"".join(audio_generator))
            print(f"Premiumfil sparad: {OUTPUT_FILE}")
        except Exception as e:
            print(f"ElevenLabs-fel: {e}")
    else:
        print("Använder Microsoft Edge-TTS (100% gratis & obegränsat)...")
        communicate = Communicate(TEXT_TO_SPEAK, FREE_EDGE_VOICE)
        await communicate.save(OUTPUT_FILE)
        print(f"Gratis utkast sparat: {OUTPUT_FILE}")


if __name__ == "__main__":
    asyncio.run(generate_voice())
