from fastapi import APIRouter

router_voice = APIRouter(prefix="/api/voice", tags=["voice"])



@router_voice.get("/speak")

def speak(text: str = "Hallo Denis, Test erfolgreich!"):

    try:

        import pyttsx3

        engine = pyttsx3.init()

        # Try to set German voice (may not be available)

        try:

            voices = engine.getProperty('voices')

            for voice in voices:

                if 'german' in voice.name.lower() or 'de' in voice.id.lower():

                    engine.setProperty('voice', voice.id)

                    break

        except:

            pass  # Use default voice

        engine.setProperty('rate', 150)  # Speech rate

        engine.say(text)

        engine.runAndWait()

        return {"ok": True, "spoken": text}

    except ImportError:

        return {"ok": False, "error": "pyttsx3 not installed. Run: pip install pyttsx3"}

    except Exception as e:

        return {"ok": False, "error": str(e)}








