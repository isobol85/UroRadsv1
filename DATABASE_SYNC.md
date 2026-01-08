# Database Sync Guide

This guide explains how to sync your development database to production on Replit.

## The Problem

Replit's development and production deployments use different databases. Data you create in development won't automatically appear in production.

## The Solution

Use the database sync scripts to export data from development and import it into production.

## How to Use

### Step 1: Export from Development (Dev Environment)

1. Make sure you're in the **development environment** (where your data exists)
2. Open the Shell in Replit
3. Run:
   ```bash
   npm run db:export
   ```
4. This creates a file called `db-export.json` with all your cases and chat messages

### Step 2: Import to Production

1. Switch to your **production deployment** or published app
2. Upload the `db-export.json` file to the root directory
3. Open the Shell in the production environment
4. Run:
   ```bash
   npm run db:import
   ```
5. Your production database now has all the data from development!

## What Gets Synced

- All cases (title, images/videos, explanations, categories, etc.)
- All chat messages associated with cases

## Safety Features

- The import uses `onConflictDoNothing()`, so it won't overwrite existing data
- If a case with the same ID already exists, it will be skipped
- You can run import multiple times safely

## Notes

- The `db-export.json` file is automatically ignored by git (added to `.gitignore`)
- You need to manually upload the exported file to production (Replit doesn't share files between dev and production)
- Make sure your production database schema is up to date (`npm run db:push`) before importing data
