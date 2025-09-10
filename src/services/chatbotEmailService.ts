// Simple Chatbot Email Service (No Dependencies, No Branding)
export interface ChatbotConversation {
  userQuestion: string;
  botResponse: string;
  timestamp: Date;
  sessionId?: string;
}

// Simple HTTP POST to send emails directly (No Branding)
export const sendChatbotConversationSimple = async (conversation: ChatbotConversation): Promise<boolean> => {
  try {
    console.log(' Attempting to send chatbot conversation to info@vayaccess.com...');
    console.log(' User Question:', conversation.userQuestion);
    console.log(' Bot Response:', conversation.botResponse);
    console.log(' Timestamp:', conversation.timestamp.toLocaleString());
    
    const emailBody = ` NEW CHATBOT CONVERSATION

 Session Details:
• Timestamp: ${conversation.timestamp.toLocaleString()}
• Session ID: ${conversation.sessionId || 'Anonymous'}
• Source: Website Chatbot (VayBot)

 USER QUESTION:
"${conversation.userQuestion}"

 BOT RESPONSE:
"${conversation.botResponse}"

 ANALYTICS:
• Question Length: ${conversation.userQuestion.length} characters
• Response Length: ${conversation.botResponse.length} characters

---
This is an automated notification from VayBot Assistant.
All chatbot conversations are logged for quality improvement and customer service.`;

    // Using your actual Formspree endpoint
    const FORMSPREE_ENDPOINT = 'https://formspree.io/f/mzzvkeqy';
    
    console.log(' Sending to Formspree endpoint:', FORMSPREE_ENDPOINT);
    
    const formData = {
      email: 'info@vayaccess.com',
      name: 'VayBot Assistant',
      subject: ` New Chatbot Conversation - ${conversation.timestamp.toLocaleString()}`,
      message: emailBody,
      user_question: conversation.userQuestion,
      bot_response: conversation.botResponse,
      session_id: conversation.sessionId || 'Anonymous',
      timestamp: conversation.timestamp.toISOString(),
    };
    
    console.log(' Form data being sent:', formData);
    
    const response = await fetch(FORMSPREE_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(formData),
    });

    console.log(' Response status:', response.status);
    console.log(' Response ok:', response.ok);
    
    if (response.ok) {
      const responseData = await response.text();
      console.log(' SUCCESS: Chatbot conversation sent to info@vayaccess.com via Formspree');
      console.log(' Response data:', responseData);
      return true;
    } else {
      const errorText = await response.text();
      console.error(' Formspree failed with status:', response.status);
      console.error(' Error response:', errorText);
      
      // Try alternative format
      console.log(' Trying alternative form format...');
      return await sendViaAlternativeFormat(conversation);
    }
    
  } catch (error) {
    console.error(' Network error sending chatbot conversation:', error);
    // Try backup method
    return await sendViaBackupMethod(conversation);
  }
};

// Alternative format method (form-encoded instead of JSON)
const sendViaAlternativeFormat = async (conversation: ChatbotConversation): Promise<boolean> => {
  try {
    console.log(' Trying form-encoded format instead of JSON...');
    
    const FORMSPREE_ENDPOINT = 'https://formspree.io/f/mzzvkeqy';
    
    const emailBody = ` NEW CHATBOT CONVERSATION

 Session Details:
• Timestamp: ${conversation.timestamp.toLocaleString()}
• Session ID: ${conversation.sessionId || 'Anonymous'}
• Source: Website Chatbot (VayBot)

 USER QUESTION:
"${conversation.userQuestion}"

 BOT RESPONSE:
"${conversation.botResponse}"

 ANALYTICS:
• Question Length: ${conversation.userQuestion.length} characters
• Response Length: ${conversation.botResponse.length} characters

---
This is an automated notification from VayBot Assistant.
All chatbot conversations are logged for quality improvement and customer service.`;

    // Try form-encoded format
    const formBody = encode({
      'email': 'info@vayaccess.com',
      'name': 'VayBot Assistant',
      'subject': ` New Chatbot Conversation - ${conversation.timestamp.toLocaleString()}`,
      'message': emailBody,
      'user_question': conversation.userQuestion,
      'bot_response': conversation.botResponse,
      'session_id': conversation.sessionId || 'Anonymous',
      'timestamp': conversation.timestamp.toISOString(),
    });

    const response = await fetch(FORMSPREE_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formBody
    });

    console.log(' Alternative format response status:', response.status);
    console.log(' Alternative format response ok:', response.ok);

    if (response.ok) {
      const responseData = await response.text();
      console.log(' SUCCESS: Chatbot conversation sent via alternative format');
      console.log(' Alternative response data:', responseData);
      return true;
    } else {
      const errorText = await response.text();
      console.error(' Alternative format also failed:', errorText);
      return false;
    }
  } catch (error) {
    console.error(' Alternative format error:', error);
    return false;
  }
};

// Backup method using Netlify forms
const sendViaNetlifyForms = async (conversation: ChatbotConversation): Promise<boolean> => {
  try {
    const response = await fetch('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: encode({
        'form-name': 'chatbot-conversations',
        'email': 'info@vayaccess.com',
        'subject': ` New Chatbot Conversation - ${conversation.timestamp.toLocaleString()}`,
        'user-question': conversation.userQuestion,
        'bot-response': conversation.botResponse,
        'session-id': conversation.sessionId || 'Anonymous',
        'timestamp': conversation.timestamp.toISOString(),
      })
    });

    if (response.ok) {
      console.log(' Chatbot conversation sent via Netlify Forms');
      return true;
    }
    return false;
  } catch (error) {
    console.error(' Netlify Forms failed:', error);
    return false;
  }
};

// Final backup: Log to console with copy-paste format
const sendViaBackupMethod = async (conversation: ChatbotConversation): Promise<boolean> => {
  console.log(`
 EMAIL BACKUP - COPY AND FORWARD TO info@vayaccess.com 

Subject:  New Chatbot Conversation - ${conversation.timestamp.toLocaleString()}

 NEW CHATBOT CONVERSATION

 Session Details:
• Timestamp: ${conversation.timestamp.toLocaleString()}
• Session ID: ${conversation.sessionId || 'Anonymous'}
• Source: Website Chatbot (VayBot)

 USER QUESTION:
"${conversation.userQuestion}"

 BOT RESPONSE:
"${conversation.botResponse}"

 ANALYTICS:
• Question Length: ${conversation.userQuestion.length} characters
• Response Length: ${conversation.botResponse.length} characters

---
This is an automated notification from VayBot Assistant.
Please forward this to info@vayaccess.com manually.
  `);
  
  return true; // Always return true for logging
};

// Helper function for URL encoding
const encode = (data: Record<string, string>) => {
  return Object.keys(data)
    .map(key => encodeURIComponent(key) + "=" + encodeURIComponent(data[key]))
    .join("&");
};

export default sendChatbotConversationSimple;
