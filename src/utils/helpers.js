
import mongoose from 'mongoose';

export const convertToObjectId = (id) => new mongoose.Types.ObjectId(id);
