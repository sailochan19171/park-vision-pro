# VayAccess Chatbot Setup Guide

## Overview
The VayAccess website now includes an intelligent chatbot powered by Groq AI that can answer questions about:
- Product information and specifications
- Pricing for all parking solutions
- Real-time parking slot availability
- Access control systems
- Installation and support services

## Features
- **Smart AI Responses**: Powered by Groq's Llama 3.3 70B model (with automatic fallbacks)
- **Comprehensive Knowledge**: Complete product catalog and pricing
- **Real-time Data**: Current parking availability across locations  
- **Robust Error Handling**: Multiple model fallbacks and smart error recovery
- **Fallback System**: Works even without API key with predefined responses
- **Beautiful UI**: Modern chat interface with quick question buttons
- **Mobile Responsive**: Works seamlessly on all devices

## Setup Instructions

### 1. Get Groq API Key
1. Visit [Groq Console](https://console.groq.com/keys)
2. Sign up or log in to your account
3. Create a new API key
4. Copy the generated key

### 2. Configure Environment
1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
2. Edit `.env` and replace `your_groq_api_key_here` with your actual API key:
   ```
   VITE_GROQ_API_KEY=gsk_your_actual_api_key_here
   ```

**Important**: Make sure to use `VITE_GROQ_API_KEY` (not `REACT_APP_GROQ_API_KEY`) as Vite uses a different environment variable prefix.

### 3. Run the Application
```bash
npm run dev
```

## Chatbot Capabilities

### Product Information
- Turnstiles (Tripod, Full Height, Optical, Swing Gate)
- Barrier Gates (Automatic, High-Speed, Heavy Duty, LED)
- Access Control (RFID, Biometric, Keypad, Mobile)
- Parking Management Software

### Pricing Information
The chatbot provides accurate pricing for all products:
- **Turnstiles**: $2,500 - $6,500
- **Barrier Gates**: $3,500 - $8,500
- **Access Control**: $150 - $2,500
- **Software**: $500 - $5,000+/month
- **Services**: Installation, maintenance, support

### Real-time Availability
Monitors 15,000+ parking spaces across 200+ locations:
- Downtown Business District
- Shopping Mall Complex
- Airport Terminal
- University Campus
- Residential Complex

## Usage Tips

### Quick Questions
The chatbot includes preset quick questions for common inquiries:
- "Show me turnstile prices"
- "Check available parking slots"
- "Tell me about access control systems"
- "Installation and support services"
- "Mobile app features"

### Best Practices
1. Ask specific questions for detailed responses
2. Use keywords like "price", "cost", "available", "slots"
3. Mention specific products for targeted information
4. Ask about installation timelines and support options

## Fallback System
Even without a Groq API key, the chatbot provides intelligent responses based on:
- Keyword detection in user messages
- Comprehensive product database
- Current pricing information
- Real-time availability data

## Troubleshooting

### Common Issues
1. **"Connection issues" message**: Check your API key in .env file
2. **"process is not defined" error**: Make sure you're using `VITE_GROQ_API_KEY` (not `REACT_APP_GROQ_API_KEY`)
3. **"Model decommissioned" error**: The chatbot now automatically handles model fallbacks
4. **Chatbot not responding**: Ensure Groq SDK is installed: `npm install groq-sdk`
5. **API key errors**: Verify the key is correctly formatted and active
6. **Environment variables not loading**: Restart the dev server after changing .env file

### Support
For technical support with the chatbot:
1. Check browser console for error messages
2. Verify API key is properly configured
3. Ensure all dependencies are installed
4. Contact development team for assistance

## Security Notes
- Never commit your `.env` file to version control
- Keep your Groq API key secure and private
- Rotate API keys regularly for security
- Monitor API usage in Groq console

## Customization
The chatbot can be easily customized:
- Update knowledge base in `Chatbot.tsx`
- Modify quick questions array
- Adjust styling and positioning
- Add new product categories or pricing

---

*VayAccess Smart Parking Solutions - Intelligent Parking Management*