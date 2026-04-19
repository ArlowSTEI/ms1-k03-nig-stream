import z from 'zod';
import { Hono } from 'hono'
import { env } from 'hono/adapter';
import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';
import { UserIdPayload, UserInFamilyPayload } from './types.js';

const app = new Hono()

const sessionMiddleware = createMiddleware<{
  Variables: { sessionToken: string }
}>(async (c, next) => {
  const authHeader = c.req.header('Authorization');

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ', 2)[1];
    c.set('sessionToken', token);
  } else {
    throw new HTTPException(401, { message: 'User is unauthorized' });
  }
  
  await next()
});

app.get('/api/:familyId/:userId', sessionMiddleware, async (c) => {
  const { LIVEKIT_API_KEY, LIVEKIT_API_SECRET } = env<{
    LIVEKIT_API_KEY: string,
    LIVEKIT_API_SECRET: string,
  }>(c);
  
  const session = c.var.sessionToken;
  const familyId = c.req.param('familyId');
  const userId = c.req.param('userId');

  const familyResponse = await fetch(
    `https://mad.labpro.hmif.dev/api/family/${familyId}`,
    { headers: { 'Authorization': `BEARER ${session}` }},
  );

  if (!familyResponse.ok) {
    throw new HTTPException(familyResponse.status as any);
  }

  try {
    const { data: { isMember } } = z.parse(UserInFamilyPayload, familyResponse.json());
    if (!isMember) {
      throw new HTTPException(401);
    }
  } catch (e) {
    if (e instanceof HTTPException) {
      throw e;
    } else {
      throw new HTTPException(500);
    }
  }

  const userResponse = await fetch(
    "https://mad.labpro.hmif.dev/api/me",
    { headers: { 'Authorization': `BEARER ${session}` }},
  );

  if (!userResponse.ok) {
    throw new HTTPException(userResponse.status as any);
  }

  const fetchedUserId = (() => {
    try {
      const userIdPayload = z.parse(UserIdPayload, userResponse.json())
      return userIdPayload.data.id;
    } catch (_) {
      throw new HTTPException(500);
    }
  })();

  const isHost = userId === fetchedUserId.toString();

  const roomName = `${familyId}.${userId}`;
  const participantName = `${userId}`;

  const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity: participantName,
  });

  at.addGrant({
    room: roomName,
    roomJoin: true,
    roomCreate: isHost,
    canPublish: isHost,
    canSubscribe: !isHost,
  });

  return c.json({data: { roomToken: await at.toJwt() }});
});

app.delete('/api/:familyId/:userId', sessionMiddleware, async (c) => {
  const { LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET } = env<{
    LIVEKIT_URL: string,
    LIVEKIT_API_KEY: string,
    LIVEKIT_API_SECRET: string,
  }>(c);
  
  const session = c.var.sessionToken;
  const familyId = c.req.param('familyId');
  const userId = c.req.param('userId');

  const familyResponse = await fetch(
    `https://mad.labpro.hmif.dev/api/family/${familyId}`,
    { headers: { 'Authorization': `BEARER ${session}` }},
  );

  if (!familyResponse.ok) {
    throw new HTTPException(familyResponse.status as any);
  }

  try {
    const { data: { isMember } } = z.parse(UserInFamilyPayload, familyResponse.json());
    if (!isMember) {
      throw new HTTPException(401);
    }
  } catch (e) {
    if (e instanceof HTTPException) {
      throw e;
    } else {
      throw new HTTPException(500);
    }
  }

  const userResponse = await fetch(
    "https://mad.labpro.hmif.dev/api/me",
    { headers: { 'Authorization': `BEARER ${session}` }},
  );

  if (!userResponse.ok) {
    throw new HTTPException(userResponse.status as any);
  }

  const fetchedUserId = (() => {
    try {
      const userIdPayload = z.parse(UserIdPayload, userResponse.json())
      return userIdPayload.data.id;
    } catch (_) {
      throw new HTTPException(500);
    }
  })();

  const isHost = userId === fetchedUserId.toString();

  if (!isHost) {
    throw new HTTPException(401);
  }

  const roomName = `${familyId}.${userId}`;

  try {
    const roomServiceClient = new RoomServiceClient(
      LIVEKIT_URL,
      LIVEKIT_API_KEY,
      LIVEKIT_API_SECRET,
    );

    await roomServiceClient.deleteRoom(roomName);
  } catch (_) {
    throw new HTTPException(500);
  }
  
  return c.json({data: { success: true }});
})

export default app
