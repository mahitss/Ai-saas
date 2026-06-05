import { execSync } from "child_process";
import * as p from "@clack/prompts";
import { generateText } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import * as dotenv from "dotenv";

// Load environment variables from .env file
dotenv.config();

const google = createGoogleGenerativeAI({
  apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY,
});

async function run() {
  p.intro("🚀 Starting Local AI Agent");

  // Check for API key
  if (!process.env.GEMINI_API_KEY && !process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    p.cancel(
      "Missing GEMINI_API_KEY environment variable. Please add it to your .env file."
    );
    process.exit(1);
  }

  const s = p.spinner();
  s.start("Checking git status");

  try {
    // Check if there are uncommitted changes
    const status = execSync("git status --porcelain").toString().trim();
    if (!status) {
      s.stop("No uncommitted changes found.");
      p.outro("Agent finished. Nothing to do.");
      process.exit(0);
    }

    // Add all changes to git to get a diff of staged changes
    execSync("git add .");

    // Get the diff of staged changes
    const diff = execSync("git diff --cached").toString().trim();
    if (!diff) {
      s.stop("No changes staged for commit.");
      p.outro("Agent finished. Nothing to do.");
      process.exit(0);
    }
    
    s.stop("Changes detected and staged.");

    s.start("Generating commit message with AI...");
    
    // Generate commit message using Gemini
    const { text: commitMessage } = await generateText({
      model: google("models/gemini-2.5-flash"), // using a fast model
      system: `You are an expert developer. Generate a concise, conventional commit message based on the provided git diff.
      The commit message should have a brief, imperative summary line under 50 characters, and an optional detailed description if necessary.
      Only output the raw commit message text. Do not wrap it in quotes, code blocks, or add any introductory text.`,
      prompt: `Diff:\n${diff.substring(0, 10000)}`, // limit to avoid token exhaustion
    });

    s.stop("Commit message generated!");

    // Ask user for confirmation
    const confirm = await p.confirm({
      message: `Generated commit message:\n\n${commitMessage}\n\nDo you want to proceed with this commit and push to GitHub?`,
      initialValue: true,
    });

    if (p.isCancel(confirm)) {
      p.cancel("Operation cancelled. Changes remain staged.");
      process.exit(0);
    }

    if (confirm) {
      s.start("Committing and pushing changes...");
      
      // Commit the changes
      execSync(`git commit -m "${commitMessage.replace(/"/g, '\\"')}"`);
      
      // Push to the current branch
      const branch = execSync("git rev-parse --abbrev-ref HEAD").toString().trim();
      execSync(`git push origin ${branch}`);
      
      s.stop("Changes pushed to GitHub successfully!");
      p.outro("Agent operation completed! 🎉");
    } else {
      const edit = await p.confirm({
        message: "Would you like to write your own commit message instead?",
        initialValue: true,
      });

      if (edit) {
        const customMessage = await p.text({
          message: "Enter your commit message:",
          placeholder: "feat: add amazing new feature",
          validate: (value) => {
            if (!value) return "Commit message is required";
          },
        });

        if (p.isCancel(customMessage)) {
          p.cancel("Operation cancelled. Changes remain staged.");
          process.exit(0);
        }

        s.start("Committing and pushing custom changes...");
        execSync(`git commit -m "${customMessage.toString().replace(/"/g, '\\"')}"`);
        const branch = execSync("git rev-parse --abbrev-ref HEAD").toString().trim();
        execSync(`git push origin ${branch}`);
        s.stop("Changes pushed to GitHub successfully!");
        p.outro("Agent operation completed! 🎉");

      } else {
        p.cancel("Operation cancelled. Changes remain staged.");
        process.exit(0);
      }
    }
  } catch (error: unknown) {
    s.stop("An error occurred");
    console.error(error instanceof Error ? error.message : error);
    p.cancel("Agent operation failed.");
    process.exit(1);
  }
}

run().catch(console.error);
