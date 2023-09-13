import { Configuration, OpenAIApi } from "openai";
import { initializeApp } from "firebase/app";
import { getDatabase, ref, set, push, get, remove, onValue } from "firebase/database";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  updateProfile,
} from "firebase/auth";

const configuration = new Configuration({
  apiKey: import.meta.env.VITE_OpenAI_API_KEY,
});

const firebaseConfig = {
  apiKey: import.meta.env.VITE_Firebase_API_KEY,
  authDomain: "askme-openai.firebaseapp.com",
  databaseURL: "https://askme-openai-default-rtdb.firebaseio.com",
  projectId: "askme-openai",
  storageBucket: "askme-openai.appspot.com",
  messagingSenderId: "490077676557",
  appId: "1:490077676557:web:e4b0a3ed202c6bd408e144",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

const database = getDatabase(app);

let userConversationsRef = null;
let currentConversationID = null;

const userEmail = document.querySelector("#userEmail");
const userPassword = document.querySelector("#userPassword");
const userNameInput = document.getElementById("userName");
const authForm = document.querySelector("#authForm");
const authTitle = document.querySelector(".auth-title h1");
const signUpButton = document.querySelector("#signUpButton");
const signInButton = document.querySelector("#signInButton");
const signOutButton = document.querySelector("#signOutButton");
const newBMain = document.querySelector(".layout-container");
newBMain.style.display = "none";
const userAuthContainer = document.querySelector(".userAuth-container");
const welcomeContainer = document.querySelector(".welcome-container");
let justSignedUp = false;
const signUpLink = document.querySelector(".signup-link");
const authAltContainerH4 = document.querySelector(".auth-alt-container h4");
const logInLink = document.querySelector(".login-link");
const chatHistoryList = document.getElementById("chat-history-list");

function openAuth(action) {
  // Depending on the action, show the corresponding form/content
  if (action === "login") {
    // display login form/content
    userNameInput.style.display = "none";
    signUpButton.style.display = "none";
    signInButton.style.display = "block";
    authTitle.innerHTML = "Welcome Back, Newbie";
    authAltContainerH4.innerHTML = 'Need an account? <a class="signup-link">Sign Up</a>';
  } else if (action === "signup") {
    // display signup form/content
    userNameInput.style.display = "block";
    signUpButton.style.display = "block";
    signInButton.style.display = "none";
    authTitle.innerHTML = "Create Account";
    authAltContainerH4.innerHTML = 'Already have an account? <a class="login-link">Log In</a>';
  }
}

// Attach the event listener to the parent container
authAltContainerH4.addEventListener("click", function (e) {
  // Check if the clicked element has the class 'login-link'
  if (e.target.classList.contains("login-link")) {
    e.preventDefault();
    openAuth("login");
  } else if (e.target.classList.contains("signup-link")) {
    e.preventDefault();
    openAuth("signup");
  }
});

const showLoggedInUI = () => {
  /*if (!auth.currentUser) {
    alert("Please log in to access the chat");
    return;
  }*/
  authForm.style.display = "none";
  userAuthContainer.style.display = "none";
  welcomeContainer.style.display = "none";
  signOutButton.style.display = "block";
  newBMain.style.display = "flex";
};

const showLoggedOutUI = () => {
  userAuthContainer.style.display = "flex";
  authForm.style.display = "flex";
  welcomeContainer.style.display = "flex";
  newBMain.style.display = "none";
  signOutButton.style.display = "none";
};

const routes = {
  "/": showLoggedOutUI,
  "/chat": showLoggedInUI,
};

const userSignUp = async () => {
  const signUpEmail = userEmail.value;
  const signUpPassword = userPassword.value;
  const userNameInput = document.getElementById("userName");
  const displayName = userNameInput.value;

  try {
    justSignedUp = true; // flag is set to true before begging the sign up and profile update process
    const userCredential = await createUserWithEmailAndPassword(auth, signUpEmail, signUpPassword);
    const user = userCredential.user;

    await updateProfile(user, { displayName: displayName });

    await signOut(auth);
    justSignedUp = false; // Reset the flag after signing out
    showLoggedOutUI();

    setTimeout(() => {
      alert("Welcome to NewB, " + displayName + "! Your account has successfully been created!");
    }, 500);

    authTitle.innerHTML = "Welcome, Newbie!";
    userNameInput.style.display = "none";
    signUpButton.style.display = "none";
    signInButton.style.display = "block";
  } catch (error) {
    justSignedUp = false; // Ensure justSignedUp is reset even on error
    const errorCode = error.code;
    const errorMessage = error.message;
    console.error(errorCode, errorMessage);
    alert("Whoops! There was an issue creating your account. Please try again!");
  }
};

// Function to save conversation history to local storage
function saveConversationToLocalStorage(conversation) {
  localStorage.setItem("userConversation", JSON.stringify(conversation));
}

// Function to load conversation history from local storage
function loadConversationFromLocalStorage() {
  const storedConversation = localStorage.getItem("userConversation");
  return storedConversation ? JSON.parse(storedConversation) : [];
}

// Define a function to load chat history when the user logs in
const loadChatHistoryOnLogIn = () => {
  const storedConversation = loadConversationFromLocalStorage();

  // Load chat history from the chatHistory array
  storedConversation.forEach((msgContent) => {
    const listItem = document.createElement("li");
    listItem.textContent = msgContent;
    chatHistoryList.appendChild(listItem);
  });
};

// When a user sends a message, save the conversation to local storage
function saveMessageToLocalStorage(message) {
  const storedConversation = loadConversationFromLocalStorage();
  storedConversation.push(message);
  saveConversationToLocalStorage(storedConversation);
}

const userSignIn = async () => {
  const signInEmail = userEmail.value;
  const signInPassword = userPassword.value;

  try {
    const userCredential = await signInWithEmailAndPassword(auth, signInEmail, signInPassword);
    const user = userCredential.user;
    showLoggedInUI();

    // Call the function to load chat history on login
    loadChatHistoryOnLogIn();
  } catch (error) {
    const errorCode = error.code;
    const errorMessage = error.message;
    console.error(errorCode, errorMessage);
    showLoggedOutUI();
    alert("Failed to sign in. Please try again.");
  }
};

function setupRealtimeListener() {
  if (userConversationsRef) {
    onValue(userConversationsRef, (snapshot) => {
      renderConversationFromDb(snapshot);
    });
  }
}

const checkAuthState = () => {
  onAuthStateChanged(auth, (user) => {
    console.log("onAuthStateChanged triggered", user); // Logging the user object

    if (user && user.uid && !justSignedUp) {
      // Ensure user has a valid UID
      userConversationsRef = ref(database, "users/" + user.uid + "/conversations");

      // Set up the real-time listener here
      setupRealtimeListener();

      // Explicitly fetch and render the chat history once when the page loads
      if (userConversationsRef) {
        get(userConversationsRef).then((snapshot) => {
          renderConversationFromDb(snapshot);
          loadChatHistory(); // Load chat history when the user is authenticated
        });
      }
      // Using hash-based routing for "chat"
      window.location.hash = "chat";
      showLoggedInUI();
    } else {
      userConversationsRef = null;

      // Clearing hash to represent the "Home" state
      window.location.hash = "";
      showLoggedOutUI();
    }
  });
};

document.querySelector(".show-icon-auth").addEventListener("click", function () {
  const passwordInput = document.getElementById("userPassword");
  const showIcon = document.querySelector(".show-icon-auth");
  const hideIcon = document.querySelector(".hide-icon-auth");

  if (passwordInput.type === "password") {
    passwordInput.type = "text";
    showIcon.style.display = "none";
    hideIcon.style.display = "block";
  } else {
    passwordInput.type = "password";
    showIcon.style.display = "block";
    hideIcon.style.display = "none";
  }
});

document.querySelector(".hide-icon-auth").addEventListener("click", function () {
  const passwordInput = document.getElementById("userPassword");
  const showIcon = document.querySelector(".show-icon-auth");
  const hideIcon = document.querySelector(".hide-icon-auth");

  passwordInput.type = "password";
  showIcon.style.display = "block";
  hideIcon.style.display = "none";
});

const userSignOut = async () => {
  await signOut(auth);
  showLoggedOutUI();
};

checkAuthState();

if (signUpButton) {
  signUpButton.addEventListener("click", userSignUp);
}

if (signInButton) {
  signInButton.addEventListener("click", userSignIn);
}

if (signOutButton) {
  signOutButton.addEventListener("click", userSignOut);
}

const conversationInDb = ref(database);

const openai = new OpenAIApi(configuration);

const chatbotConversation = document.getElementById("chatbot-conversation");

const instructionObj = {
  role: "system",
  content:
    "You are both a pediatrician and a parent. Engage in a back-and-forth conversation with the user, paying close attention to the user's questions and context. Offer warm, actionable and concise advice in 50 words or less, ensuring your responses are relevant to the user's query.",
};

const userInput = document.getElementById("user-input");
const suggestionButtons = document.querySelector(".suggested-prompts");
const promptToggle = document.getElementById("prompt-toggle");
const clearButton = document.getElementById("clear-btn");

userInput.addEventListener("input", () => {
  const trimmedInput = userInput.value.trim();

  if (trimmedInput !== "") {
    suggestionButtons.style.display = "none";
    promptToggle.style.display = "none";
  } else {
    suggestionButtons.style.display = "grid";
    promptToggle.style.display = "flex";
  }
});

function resetConversation() {
  chatbotConversation.innerHTML = "";
  const starterMessage = document.createElement("div");
  starterMessage.className = "speech speech-ai";
  starterMessage.innerHTML = "<h4>Hey, newbie parent! What can I help you with today?</h4>";
  chatbotConversation.appendChild(starterMessage);
  userInput.value = "";
  suggestionButtons.style.display = "grid";
  promptToggle.style.display = "flex";
}

clearButton.addEventListener("click", () => {
  // Reset the conversation in the UI
  resetConversation();

  // Reset the currentConversationID so a new one is generated for the next chat session
  currentConversationID = null;
});

document.addEventListener("submit", (e) => {
  e.preventDefault();
  if (!userConversationsRef) {
    console.error("No user specific database references available");
    // alert("Please log in again to continue the conversation");
    return;
  }
  // If there's no current conversation, create a new one //
  if (!currentConversationID) {
    currentConversationID = push(userConversationsRef).key; // this generates a new unique ID
  }

  // Use the unique ID to store messages
  const messageRef = ref(database, `users/${auth.currentUser.uid}/conversations/${currentConversationID}`);
  console.log("Attempting to push user message");
  console.log("User's message:", { role: "user", content: userInput.value });
  push(messageRef, {
    role: "user",
    content: userInput.value,
  });

  // Call the render function here:
  get(messageRef).then((snapshot) => {
    renderConversationFromDb(snapshot);
    saveMessageToLocalStorage(userInput.value); // Save the user's message
  });

  fetchReply();

  const newSpeechBubble = document.createElement("div");
  newSpeechBubble.classList.add("speech", "speech-human");
  chatbotConversation.appendChild(newSpeechBubble);
  newSpeechBubble.textContent = userInput.value;
  userInput.value = "";
  chatbotConversation.scrollTop = chatbotConversation.scrollHeight;
});

function fetchReply() {
  if (!userConversationsRef) {
    console.error("No user specific database reference available");
    return;
  }

  get(userConversationsRef).then(async (snapshot) => {
    if (snapshot.exists()) {
      const rawMessages = snapshot.val();

      // Create a flattened array of messages from the Firebase data
      let conversationArr = [];
      conversationArr.push(instructionObj); // Insert the instruction message
      for (let key in rawMessages) {
        if (rawMessages[key].role && rawMessages[key].content) {
          conversationArr.push({ role: rawMessages[key].role, content: rawMessages[key].content });
        } else {
          for (let innerKey in rawMessages[key]) {
            if (rawMessages[key][innerKey].role && rawMessages[key][innerKey].content) {
              conversationArr.push({
                role: rawMessages[key][innerKey].role,
                content: rawMessages[key][innerKey].content,
              });
            }
          }
        }
      }

      // Log the entire conversation that will be sent to OpenAI
      console.log("Entire conversation being sent to OpenAI", JSON.stringify(conversationArr, null, 2));

      // Send the updated conversation array to OpenAI
      console.log("Sending the following payload to OpenAI:", conversationArr);
      const response = await openai.createChatCompletion({
        model: "gpt-4",
        messages: conversationArr,
        presence_penalty: 0,
        frequency_penalty: 0.3,
      });

      const botResponse = response.data.choices[0].message.content.replace(/^(User|Assistant): /, ""); // Remove the role prefix from the bot's response

      console.log("Bot response data:", botResponse);
      console.log("Current user UID:", auth.currentUser.uid);
      const responseRef = ref(database, `users/${auth.currentUser.uid}/conversations/${currentConversationID}`);
      push(responseRef, {
        role: "assistant",
        content: botResponse,
      });

      // Ensure chat history list remains visible
      if (chatHistoryList) {
        chatHistoryList.style.display = "block";
      }
      renderTypewriterText(botResponse);
    } else {
      console.log("No data available");
    }
  });
}

function renderTypewriterText(text) {
  const newSpeechBubble = document.createElement("div");
  newSpeechBubble.classList.add("speech", "speech-ai", "blinking-cursor");
  chatbotConversation.appendChild(newSpeechBubble);

  let i = 0;
  function animate() {
    newSpeechBubble.textContent = newSpeechBubble.textContent + text.slice(i - 1, i);
    if (text.length === i) {
      newSpeechBubble.classList.remove("blinking-cursor");
      return;
    }
    i++;
    chatbotConversation.scrollTop = chatbotConversation.scrollHeight;
    requestAnimationFrame(animate);
  }
  requestAnimationFrame(animate);
}

let suggestionHidden = true; // Initial State

suggestionButtons.style.opacity = "0";
suggestionButtons.style.transform = "translateX(-50%) translateY(0)";
suggestionButtons.style.visibility = "hidden";
promptToggle.style.transform = "translateY(185px)";

const promptToggleText = document.querySelector("#prompt-toggle h5");
promptToggleText.textContent = "Show Suggested Prompts";

const hideIcon = document.querySelector(".hide-icon");
const showIcon = document.querySelector(".show-icon");

hideIcon.style.display = "none";
showIcon.style.display = "inline-block";

document.getElementById("prompt-toggle").addEventListener("click", () => {
  if (suggestionHidden) {
    // Show the suggestionButtons
    suggestionButtons.style.opacity = "1";
    suggestionButtons.style.visibility = "visible";
    suggestionButtons.style.transform = "translateX(-50%) translateY(0)";
    suggestionButtons.style.transitionDelay = "0s"; // No delay
    promptToggle.style.transform = "translateY(0)";
    promptToggleText.textContent = "Hide Suggested Prompts";
    hideIcon.style.display = "inline-block";
    showIcon.style.display = "none";
  } else {
    // Hide the suggestionButtons
    suggestionButtons.style.opacity = "0";
    suggestionButtons.style.transform = "translateX(-50%) translateY(100%)"; // Move it downwards
    suggestionButtons.style.transitionDelay = "0s, 0s, 0.3s"; // Delay visibility
    promptToggle.style.transform = "translateY(185px)"; // Move it half the height downwards
    promptToggleText.textContent = "Show Suggested Prompts";
    hideIcon.style.display = "none";
    showIcon.style.display = "inline-block";
    setTimeout(() => {
      suggestionButtons.style.visibility = "hidden"; // Apply visibility hidden after a delay
    }, 300); // This delay should match the transition duration
  }
  suggestionHidden = !suggestionHidden; // Toggle the state
});

let lastRenderedUserMessage = ""; // Store the last rendered user message outside function
let previousConversations = [];

function renderConversationFromDb(snapshot) {
  let messages = [];

  if (snapshot && snapshot.exists()) {
    messages = Object.values(snapshot.val());

    // Initialize a variable to keep track of the initial user message
    let initialUserMessage = null;

    // Iterate through the messages and find the initial user message
    messages.forEach((msg, index) => {
      if (msg.role === "user" && !initialUserMessage) {
        initialUserMessage = msg.content;

        // Display only the first 5 words of the initial user message
        const first5Words = initialUserMessage.split(" ").slice(0, 5).join(" ");
        const initialUserMessageListItem = document.createElement("li");
        initialUserMessageListItem.textContent = first5Words;
        chatHistoryList.appendChild(initialUserMessageListItem);
      }

      if (msg.role === "user" && index === 0) {
        // Skip adding the user's message to the chat history list
        return;
      }

      if (msg.role === "assistant") {
        // Skip adding chatbot responses to the chat history list
        return;
      }

      // Determine the class for styling based on the role
      const listItem = document.createElement("li");
      if (msg.role === "user") {
        listItem.classList.add("user-message");
      } else if (msg.role === "assistant") {
        listItem.classList.add("assistant-message");
      }

      listItem.textContent = msg.content;
      chatHistoryList.appendChild(listItem);
    });

    // Scroll to the bottom of the chat history list
    chatHistoryList.scrollTop = chatHistoryList.scrollHeight;
  }

  // Ensuring that the chat history list visibility remains the same
  if (messages.length > 0 || suggestionButtons.style.display !== "none" || promptToggle.style.display !== "none") {
    suggestionButtons.style.display = "grid";
    promptToggle.style.display = "flex";
  } else {
    suggestionButtons.style.display = "none";
    promptToggle.style.display = "none";
  }
}

const chatHistory = []; // Initialize an empty array for chat history

function loadChatHistory() {
  if (userConversationsRef) {
    get(userConversationsRef)
      .then((snapshot) => {
        if (snapshot.exists()) {
          renderConversationFromDb(snapshot);
          const messages = Object.values(snapshot.val());
          messages.forEach((msg) => {
            if (msg.role === "user") {
              chatHistory.push(msg.content);
            } else if (msg.role === "assistant") {
              chatHistory.push(msg.content);
            }
          });
          // Render chat history list from the chatHistory array
          chatHistoryList.innerHTML = "";
          chatHistory.forEach((msgContent) => {
            const listItem = document.createElement("li");
            listItem.textContent = msgContent;
            chatHistoryList.appendChild(listItem);
          });
        } else {
          console.log("No data available in the snapshot.");
        }
      })
      .catch((error) => {
        console.error("Error loading chat history:", error);
      });
  }
}

// Tag line animation on Welcome Page //

const colors = ["#83BF6A", "#E8766C", "#81D3DB", "#FFD159", "#544F4F"];
let colorIndex = 0;

const textWrapper = document.querySelector(".ml6 .letters");
textWrapper.innerHTML = textWrapper.textContent.replace(/\S/g, "<span class='letter'>$&</span>");

anime
  .timeline({
    loop: true,
    update: function (anim) {
      // Check if a loop iteration has completed
      if (anim.progress >= 100) {
        // Increment the color index
        colorIndex = (colorIndex + 1) % colors.length;
        // Update the color
        document.querySelector(".ml6 .text-wrapper").style.color = colors[colorIndex];
      }
    },
  })
  .add({
    targets: ".ml6 .letter",
    translateY: ["1.1em", 0],
    translateZ: 0,
    duration: 750,
    delay: (el, i) => 50 * i,
  })
  .add({
    targets: ".ml6",
    opacity: 0,
    duration: 1000,
    easing: "easeOutExpo",
    delay: 1000,
  });
