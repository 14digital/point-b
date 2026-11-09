import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** A JPEG data URL (the browser converts every upload to JPEG), or "" to remove the photo. */
export const PHOTO_IMAGE = /^(data:image\/jpeg;base64,[A-Za-z0-9+/=]+)?$/;
export const PHOTO_IMAGE_MAX_LENGTH = 2_000_000;
export const PHOTO_IMAGE_MESSAGE = 'The photo must be a JPEG image.';

/**
 * Stores or removes a mentor's uploaded headshot and returns the value for MentorProfile.photoUrl. The image lives in
 * its own collection so the mentor lists, which all read photoUrl, stay small; the version makes a new photo show at once.
 */
export async function saveMentorPhoto(prisma: PrismaService, mentorId: string, image: string): Promise<string | null> {
  if (!image) {
    await prisma.mentorImage.deleteMany({ where: { mentorId } });
    return null;
  }
  const data = Buffer.from(image.slice(image.indexOf(',') + 1), 'base64');
  if (data.length < 3 || data[0] !== 0xff || data[1] !== 0xd8 || data[2] !== 0xff) throw new BadRequestException(PHOTO_IMAGE_MESSAGE);
  await prisma.mentorImage.upsert({ where: { mentorId }, create: { mentorId, data }, update: { data } });
  return `/api/mentors/${mentorId}/photo?v=${Date.now().toString(36)}`;
}
