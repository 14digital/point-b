import { BadRequestException, Body, Controller, Get, HttpException, Param, Patch, Post, Query, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthUser, CurrentUser, Public, Roles, Staff } from '../common/auth';
import { clientIp, locate, visitorCountry } from '../common/geo';
import { AssistantChatDto, ChatModeDto, TeamReplyDto } from './assistant.dto';
import { AssistantService } from './assistant.service';
import { ChatStoreService } from './chat-store.service';

@ApiTags('assistant')
@Controller('assistant')
export class AssistantController {
  constructor(private assistant: AssistantService, private store: ChatStoreService) {}

  /**
   * One message from the chat bubble. It is saved; then, unless a team member is in the chat, the AI's reply
   * streams back as plain text and is saved too. While a team member has the chat, the answer is JSON
   * { mode: "agent" } and their reply arrives through the messages endpoint.
   */
  @Public() @Throttle({ default: { limit: 60, ttl: 3_600_000 } })
  @Post('chat')
  async chat(@Body() dto: AssistantChatDto, @CurrentUser() user: AuthUser | undefined, @Req() req: Request, @Res() res: Response) {
    const place = locate(clientIp(req));
    const country = visitorCountry(req); // honours the local preview country, for prices
    const { conversation, agent } = await this.store.addUserMessage(dto.key, dto.message.trim(), user, { page: dto.page, country: place.country ?? country ?? undefined, city: place.city });
    if (agent) { res.status(200).json({ mode: 'agent' }); return; }

    const stream = this.assistant.chat(await this.store.history(conversation.id), dto, user, country);
    let first: IteratorResult<string>;
    try { first = await stream.next(); } catch (e) {
      const status = e instanceof HttpException ? e.getStatus() : 503;
      res.status(status).json({ message: e instanceof HttpException ? e.message : 'Chat is busy right now. Please try again in a moment.' });
      return;
    }
    res.status(200).set({ 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' });
    res.flushHeaders();
    let reply = '';
    if (!first.done) { reply += first.value; res.write(first.value); }
    try { for await (const chunk of stream) { reply += chunk; res.write(chunk); } }
    catch { const sorry = '\n\nSorry, I lost my connection for a second. Could you send that again?'; reply += sorry; res.write(sorry); }
    res.end();
    await this.store.addAssistantMessage(conversation.id, reply);
  }

  /** The browser's own conversation, for loading it again and picking up replies from the team. */
  @Public() @Throttle({ default: { limit: 2000, ttl: 3_600_000 } })
  @Get('chat/:key')
  messages(@Param('key') key: string, @Query('after') after?: string) {
    if (!key) throw new BadRequestException('Invalid chat');
    return this.store.forVisitor(key, after);
  }
}

@ApiTags('admin')
@ApiBearerAuth()
@Roles('ADMIN')
@Staff('OPERATIONS')
@Controller('admin/chats')
export class AdminChatsController {
  constructor(private store: ChatStoreService) {}

  @Get() list() { return this.store.list(); }
  @Get('unread') unread() { return this.store.unread(); }
  @Get(':id') open(@Param('id') id: string) { return this.store.open(id); }
  @Post(':id/messages') reply(@Param('id') id: string, @CurrentUser() u: AuthUser, @Body() dto: TeamReplyDto) { return this.store.reply(id, u, dto.content); }
  @Patch(':id/mode') mode(@Param('id') id: string, @CurrentUser() u: AuthUser, @Body() dto: ChatModeDto) { return this.store.setMode(id, u, dto.mode); }
}
