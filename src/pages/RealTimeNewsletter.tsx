
import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Switch } from '../components/ui/switch';
import { Label } from '../components/ui/label';
import { toast } from '../hooks/use-toast';
import { subscribeToNewsletter, autoPublishUpdate } from '../services/newsletterBackend';
import { onSnapshot, collection, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../services/firebase';
import { Badge } from '../components/ui/badge';
import { ExternalLink, Mail, Send, Newspaper, Bell, CheckCircle, XCircle } from 'lucide-react';

interface Update {
  id: string;
  version: string;
  title: string;
  body: string;
  link: string;
  publishedAt: Date;
  status: 'published' | 'pending' | 'failed';
}

const RealTimeNewsletter = () => {
  const [email, setEmail] = useState('');
  const [isSubscribing, setIsSubscribing] = useState(false);
  const [newUpdate, setNewUpdate] = useState({ title: '', body: '', link: '/' });
  const [isPublishing, setIsPublishing] = useState(false);
  const [updates, setUpdates] = useState<Update[]>([]);
  const [isAutoPublishEnabled, setIsAutoPublishEnabled] = useState(true);

  useEffect(() => {
    const q = query(collection(db, "updates"), orderBy("publishedAt", "desc"), limit(10));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const newUpdates = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        publishedAt: doc.data().publishedAt.toDate(),
      })) as Update[];
      setUpdates(newUpdates);

      // Auto-publish the latest update if it's new
      if (isAutoPublishEnabled && newUpdates.length > 0) {
        const latestUpdate = newUpdates[0];
        if (latestUpdate.status === 'pending') {
          handleAutoPublish(latestUpdate);
        }
      }
    });

    return () => unsubscribe();
  }, [isAutoPublishEnabled]);

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      toast({ title: 'Error', description: 'Please enter your email.', variant: 'destructive' });
      return;
    }
    setIsSubscribing(true);
    try {
      const response = await subscribeToNewsletter(email, 'real-time-page');
      if (response.success) {
        toast({ title: 'Subscribed!', description: "You'll receive our latest updates." });
        setEmail('');
      } else {
        throw new Error(response.message);
      }
    } catch (error) {
      toast({ title: 'Subscription Failed', description: error instanceof Error ? error.message : 'Please try again.', variant: 'destructive' });
    } finally {
      setIsSubscribing(false);
    }
  };

  const handlePublish = async () => {
    if (!newUpdate.title || !newUpdate.body) {
      toast({ title: 'Error', description: 'Please fill in title and body for the update.', variant: 'destructive' });
      return;
    }
    setIsPublishing(true);
    const version = `v${new Date().toISOString()}`;
    try {
      // This would typically be an admin action to create a 'pending' update in Firestore.
      // For this demo, we'll call the auto-publish endpoint directly.
      const response = await autoPublishUpdate(version, newUpdate.title, newUpdate.body, newUpdate.link);
      if (response.success) {
        toast({ title: 'Update Published!', description: 'Your update has been sent to subscribers.' });
        setNewUpdate({ title: '', body: '', link: '/' });
      } else {
        throw new Error(response.message);
      }
    } catch (error) {
      toast({ title: 'Publishing Failed', description: error instanceof Error ? error.message : 'Please try again.', variant: 'destructive' });
    } finally {
      setIsPublishing(false);
    }
  };

  const handleAutoPublish = useCallback(async (update: Update) => {
    try {
      // This function simulates the backend trigger that sends the newsletter.
      // In a real app, a Cloud Function would listen to Firestore 'updates' collection.
      console.log(`Attempting to auto-publish update: ${update.title}`);
      const response = await autoPublishUpdate(update.version, update.title, update.body, update.link);
      
      // Here you would update the status of the document in Firestore
      // For now, we just log the result.
      if (response.success) {
        console.log(`Successfully auto-published: ${update.title}`);
        toast({ title: 'New Update Sent!', description: `"${update.title}" has been sent to subscribers.` });
      } else {
        console.error(`Failed to auto-publish: ${response.message}`);
      }
    } catch (error) {
      console.error('Auto-publish error:', error);
    }
  }, []);

  return (
    <div className="container mx-auto p-4 md:p-8">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        
        {/* Left Column: Subscription and Publishing */}
        <div className="space-y-8">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center"><Mail className="mr-2" /> Subscribe for Updates</CardTitle>
              <CardDescription>Get the latest news and product announcements directly in your inbox.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubscribe} className="flex items-center space-x-2">
                <Input
                  type="email"
                  placeholder="your.email@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isSubscribing}
                  required
                />
                <Button type="submit" disabled={isSubscribing}>
                  <Send className="mr-2 h-4 w-4" />
                  {isSubscribing ? 'Subscribing...' : 'Subscribe'}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center"><Newspaper className="mr-2" /> Publish a New Article</CardTitle>
              <CardDescription>This form simulates an admin panel for publishing new content, which then triggers the newsletter.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                placeholder="Article Title"
                value={newUpdate.title}
                onChange={(e) => setNewUpdate({ ...newUpdate, title: e.target.value })}
                disabled={isPublishing}
              />
              <Textarea
                placeholder="Main content of the article..."
                value={newUpdate.body}
                onChange={(e) => setNewUpdate({ ...newUpdate, body: e.target.value })}
                disabled={isPublishing}
                rows={5}
              />
              <Input
                placeholder="Link to full article (e.g., /blog/new-post)"
                value={newUpdate.link}
                onChange={(e) => setNewUpdate({ ...newUpdate, link: e.target.value })}
                disabled={isPublishing}
              />
              <Button onClick={handlePublish} disabled={isPublishing} className="w-full">
                <Bell className="mr-2 h-4 w-4" />
                {isPublishing ? 'Publishing...' : 'Publish & Notify Subscribers'}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Real-time Updates Feed */}
        <Card>
          <CardHeader>
            <CardTitle>Live Updates Feed</CardTitle>
            <CardDescription>This feed listens to the 'updates' collection in Firestore in real-time.</CardDescription>
            <div className="flex items-center space-x-2 pt-4">
              <Switch
                id="auto-publish-switch"
                checked={isAutoPublishEnabled}
                onCheckedChange={setIsAutoPublishEnabled}
              />
              <Label htmlFor="auto-publish-switch">Enable Auto-Publishing</Label>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4 max-h-[600px] overflow-y-auto">
              {updates.length > 0 ? updates.map(update => (
                <div key={update.id} className="p-4 border rounded-lg hover:bg-gray-50">
                  <div className="flex justify-between items-start">
                    <h3 className="font-bold text-lg">{update.title}</h3>
                    <Badge variant={update.status === 'published' ? 'default' : 'secondary'}>
                      {update.status === 'published' ? <CheckCircle className="mr-1 h-3 w-3" /> : <XCircle className="mr-1 h-3 w-3" />}
                      {update.status}
                    </Badge>
                  </div>
                  <p className="text-sm text-gray-600 mt-1">{update.body.substring(0, 150)}...</p>
                  <div className="flex justify-between items-center mt-3">
                    <span className="text-xs text-gray-500">{update.publishedAt.toLocaleString()}</span>
                    <a href={update.link} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline flex items-center">
                      Read More <ExternalLink className="ml-1 h-4 w-4" />
                    </a>
                  </div>
                </div>
              )) : (
                <p className="text-center text-gray-500 py-8">No updates yet. Publish one to see it here!</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default RealTimeNewsletter;