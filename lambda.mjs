import pkgIotData from '@aws-sdk/client-iot-data-plane';
const { IoTDataPlaneClient, PublishCommand } = pkgIotData;

import pkgIot from '@aws-sdk/client-iot';
const { IoTClient, GetThingShadowCommand, UpdateThingShadowCommand } = pkgIot;

// AWS IoT configuration
const AWS_REGION = "ap-south-1";
const IOT_TOPIC = "esp32/ac_control/command";
const THING_NAME = "ESP32_AC";

// Initialize IoT clients
const iotDataClient = new IoTDataPlaneClient({ region: AWS_REGION });
const iotClient = new IoTClient({ region: AWS_REGION });

// Temperature limits and default state
const MIN_TEMP = 16;
const MAX_TEMP = 32;
const DEFAULT_STATE = {
  power: true,
  temp: 24,
  mode: "cool",
  fan: "high",
  swing: true,
  sleep: false,
  timer: 0
};

// Helper function to get current state from Device Shadow
async function getCurrentState() {
  try {
    const command = new GetThingShadowCommand({ thingName: THING_NAME });
    const response = await iotClient.send(command);
    const shadow = JSON.parse(Buffer.from(response.payload).toString());
    return { ...DEFAULT_STATE, ...shadow.state.reported };
  } catch (error) {
    console.warn("Failed to get shadow, using default state:", error.message);
    return DEFAULT_STATE;
  }
}

// Helper function to update Device Shadow
async function updateShadow(state) {
  try {
    const currentState = await getCurrentState();
    const updatedState = { ...currentState, ...state };
    const command = new UpdateThingShadowCommand({
      thingName: THING_NAME,
      payload: JSON.stringify({ state: { reported: updatedState } })
    });
    await iotClient.send(command);
    console.log("Updated shadow:", updatedState);
  } catch (error) {
    console.warn("Failed to update shadow:", error.message);
  }
}

// Helper function to publish message to IoT Core
async function publishToIoT(message) {
  const params = {
    topic: IOT_TOPIC,
    payload: JSON.stringify(message),
    qos: 0
  };

  try {
    const command = new PublishCommand(params);
    await iotDataClient.send(command);
    console.log(`Published to ${IOT_TOPIC}: ${JSON.stringify(message)}`);
    await updateShadow(message);
    return true;
  } catch (error) {
    console.error("Failed to publish to IoT:", error.message);
    return false;
  }
}

// Build Alexa response
function buildResponse(speechText, shouldEndSession = false) {
  return {
    version: "1.0",
    response: {
      outputSpeech: {
        type: "PlainText",
        text: speechText || "Sorry, something went wrong. Please try again."
      },
      shouldEndSession
    }
  };
}

// Handle different intents
async function handleIntentRequest(request) {
  const intentName = request.intent.name;
  console.log(`Intent: ${intentName}`);

  try {
    switch (intentName) {
      case 'AMAZON.HelpIntent':
        return buildResponse("You can say things like, turn on the AC, set temperature to 22, set fan to high, turn sleep mode on, or set timer to 5 hours.");
      
      case 'AMAZON.StopIntent':
      case 'AMAZON.CancelIntent':
        return buildResponse("Goodbye!", true);
      
      case 'PowerIntent':
        return await handlePowerIntent(request.intent);
      
      case 'SetTemperatureIntent':
        return await handleTemperatureIntent(request.intent);
      
      case 'SetModeIntent':
        return await handleModeIntent(request.intent);
      
      case 'SetFanIntent':
        return await handleFanIntent(request.intent);
      
      case 'SetSwingIntent':
        return await handleSwingIntent(request.intent);
      
      case 'SleepIntent':
        return await handleSleepIntent(request.intent);
      
      case 'SetTimerIntent':
        return await handleTimerIntent(request.intent);
      
      case 'ControlACIntent':
        return await handleControlACIntent(request.intent);
      
      default:
        return buildResponse("Sorry, I don't understand that command.", true);
    }
  } catch (error) {
    console.error("Error handling intent:", error.message);
    return buildResponse("Sorry, there was an error processing your request. Please try again.", true);
  }
}

// Handle power on/off intent
async function handlePowerIntent(intent) {
  const powerSlot = intent.slots.Power.value?.toLowerCase();
  
  if (!powerSlot || (powerSlot !== "on" && powerSlot !== "off")) {
    return buildResponse("Please say on or off for the AC.");
  }
  
  const powerState = powerSlot === "on";
  const currentState = await getCurrentState();
  const message = powerState
    ? { ...currentState, power: true, timer: 0 }
    : { power: false, timer: 0 };
  
  const success = await publishToIoT(message);
  
  return buildResponse(
    success ? `Turning ${powerSlot} the AC.` : "Sorry, I couldn't control your AC. Please try again.",
    true
  );
}

// Handle temperature setting intent
async function handleTemperatureIntent(intent) {
  const tempValue = parseInt(intent.slots.Temperature.value);
  
  if (isNaN(tempValue) || tempValue < MIN_TEMP || tempValue > MAX_TEMP) {
    return buildResponse(`Please specify a temperature between ${MIN_TEMP} and ${MAX_TEMP} degrees.`);
  }
  
  const message = {
    power: true,
    temp: tempValue
  };
  
  const success = await publishToIoT(message);
  
  return buildResponse(
    success ? `Setting temperature to ${tempValue} degrees.` : "Sorry, I couldn't control your AC. Please try again.",
    true
  );
}

// Handle mode change intent
async function handleModeIntent(intent) {
  const modeSlot = intent.slots.Mode.value?.toLowerCase();
  
  const validModes = ["cool", "auto", "dry", "fan"];
  if (!modeSlot || !validModes.includes(modeSlot)) {
    return buildResponse("Please specify a valid mode: cool, auto, dry, or fan.");
  }
  
  const currentState = await getCurrentState();
  const message = {
    ...currentState,
    power: true,
    mode: modeSlot
  };
  
  const success = await publishToIoT(message);
  
  return buildResponse(
    success ? `Changing mode to ${modeSlot}.` : "Sorry, I couldn't control your AC. Please try again.",
    true
  );
}

// Handle fan speed intent
async function handleFanIntent(intent) {
  const fanSlot = intent.slots.FanSpeed.value?.toLowerCase();
  
  const validFanSpeeds = ["auto", "low", "medium", "high"];
  const fanMapping = {
    "medium": "med",
    "auto": "auto",
    "low": "low",
    "high": "high"
  };
  
  if (!fanSlot || !validFanSpeeds.includes(fanSlot)) {
    return buildResponse("Please specify a valid fan speed: auto, low, medium, or high.");
  }
  
  const message = {
    power: true,
    fan: fanMapping[fanSlot] || fanSlot
  };
  
  const success = await publishToIoT(message);
  
  return buildResponse(
    success ? `Setting fan speed to ${fanSlot}.` : "Sorry, I couldn't control your AC. Please try again.",
    true
  );
}

// Handle swing on/off intent
async function handleSwingIntent(intent) {
  const swingSlot = intent.slots.SwingState.value?.toLowerCase();
  
  if (!swingSlot || (swingSlot !== "on" && swingSlot !== "off")) {
    return buildResponse("Please say on or off for swing.");
  }
  
  const swingState = swingSlot === "on";
  const currentState = await getCurrentState();
  const message = {
    ...currentState,
    power: true,
    swing: swingState
  };
  
  const success = await publishToIoT(message);
  
  return buildResponse(
    success ? `Turning swing ${swingSlot}.` : "Sorry, I couldn't control your AC. Please try again.",
    true
  );
}

// Handle sleep on/off intent
async function handleSleepIntent(intent) {
  const sleepSlot = intent.slots.SleepState.value?.toLowerCase();
  
  if (!sleepSlot || (sleepSlot !== "on" && sleepSlot !== "off")) {
    return buildResponse("Please say on or off for sleep mode.");
  }
  
  const sleepState = sleepSlot === "on";
  const currentState = await getCurrentState();
  const message = {
    ...currentState,
    power: true,
    sleep: sleepState
  };
  
  const success = await publishToIoT(message);
  
  return buildResponse(
    success ? `Turning sleep mode ${sleepSlot}.` : "Sorry, I couldn't control your AC. Please try again.",
    true
  );
}

// Handle timer setting intent
async function handleTimerIntent(intent) {
  const timerHours = parseInt(intent.slots.TimerHours?.value);
  
  // Check if user said "turn timer off" or similar
  const isOffRequest = !intent.slots.TimerHours?.value || intent.slots.TimerHours.value.toLowerCase() === "off";
  const timerValue = isOffRequest ? 0 : timerHours;
  
  if (!isOffRequest && (isNaN(timerHours) || timerHours < 0 || timerHours > 24)) {
    return buildResponse("Please specify a timer between 0 and 24 hours, or say turn timer off.");
  }
  
  const currentState = await getCurrentState();
  const message = {
    ...currentState,
    power: true,
    timer: timerValue
  };
  
  const success = await publishToIoT(message);
  
  return buildResponse(
    success
      ? timerValue === 0
        ? "Turning off the timer."
        : `Setting timer to ${timerValue} hours.`
      : "Sorry, I couldn't control your AC. Please try again.",
    true
  );
}

// Handle combined AC control intent
async function handleControlACIntent(intent) {
  const powerSlot = intent.slots.Power.value?.toLowerCase();
  const fanSlot = intent.slots.FanSpeed?.value?.toLowerCase();
  const modeSlot = intent.slots.Mode?.value?.toLowerCase();
  const tempSlot = intent.slots.Temperature?.value;
  const swingSlot = intent.slots.SwingState?.value?.toLowerCase();
  const timerSlot = intent.slots.TimerHours?.value;
  
  const powerState = powerSlot === "on" || !powerSlot ? true : powerSlot === "off" ? false : null;
  if (powerState === null) {
    return buildResponse("Please say on or off for the AC.");
  }
  
  if (!powerState) {
    const message = { power: false, timer: 0 };
    const success = await publishToIoT(message);
    return buildResponse(
      success ? "Turning off the AC." : "Sorry, I couldn't control your AC. Please try again.",
      true
    );
  }
  
  const currentState = await getCurrentState();
  
  const validFanSpeeds = ["auto", "low", "medium", "high"];
  const fanMapping = {
    "medium": "med",
    "auto": "auto",
    "low": "low",
    "high": "high"
  };
  const fanSpeed = fanSlot && validFanSpeeds.includes(fanSlot) ? fanMapping[fanSlot] || fanSlot : currentState.fan;
  
  const validModes = ["cool", "auto", "dry", "fan"];
  const mode = modeSlot && validModes.includes(modeSlot) ? modeSlot : currentState.mode;
  
  let tempValue = tempSlot ? parseInt(tempSlot) : currentState.temp;
  if (tempSlot && (isNaN(tempValue) || tempValue < MIN_TEMP || tempValue > MAX_TEMP)) {
    return buildResponse(`Please specify a temperature between ${MIN_TEMP} and ${MAX_TEMP} degrees.`);
  }
  
  const swingState = swingSlot === "on" ? true : swingSlot === "off" ? false : currentState.swing;
  
  let timerValue = timerSlot ? parseInt(timerSlot) : currentState.timer;
  if (timerSlot && (isNaN(timerValue) || timerValue < 0 || timerValue > 24)) {
    return buildResponse("Please specify a timer between 0 and 24 hours.");
  }
  
  const message = {
    power: true,
    fan: fanSpeed,
    mode: mode,
    temp: tempValue,
    swing: swingState,
    sleep: currentState.sleep || false,
    timer: timerValue
  };
  
  const success = await publishToIoT(message);
  
  return buildResponse(
    success
      ? `Turning on the AC with ${fanSpeed} fan speed, ${mode} mode, ${tempValue} degrees, swing ${swingState ? "on" : "off"}, and timer ${timerValue === 0 ? "off" : `${timerValue} hours`}.`
      : "Sorry, I couldn't control your AC. Please try again.",
    true
  );
}

// Main handler for Lambda
export const handler = async (event) => {
  console.log("Event:", JSON.stringify(event, null, 2));

  try {
    if (!event.request) {
      console.log("Direct Lambda test, not Alexa");
      const currentState = await getCurrentState();
      const success = await publishToIoT({ ...currentState, power: true });
      return {
        statusCode: success ? 200 : 500,
        body: JSON.stringify(success ? "Test message sent to AC" : "Error sending test message")
      };
    }

    const requestType = event.request.type;
    
    switch (requestType) {
      case 'LaunchRequest':
        return buildResponse("AC control ready. Say something like 'turn on the AC' or 'set timer to 5 hours'.", false);
      
      case 'IntentRequest':
        return await handleIntentRequest(event.request);
      
      case 'SessionEndedRequest':
        return buildResponse("Goodbye!", true);
      
      default:
        return buildResponse("Sorry, I don't understand that request.", true);
    }
  } catch (error) {
    console.error("Handler error:", error.message);
    return buildResponse("Sorry, there was an error processing your request. Please try again.", true);
  }
};