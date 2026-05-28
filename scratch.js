import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve('.env') });
import Business from './src/models/Business.js';

async function test() {
  await mongoose.connect(process.env.MONGO_URI);
  try {
    const updatedBusiness = await Business.findByIdAndUpdate(
        "6a1897ad88329ac64fc633ae", // jivko
        {
          subscriptionStatus: "active",
        },
        { new: true }
    );
    console.log("updatedBusiness:", updatedBusiness);
    
    if (updatedBusiness.referredBy && !updatedBusiness.referralRewardClaimed) {
        console.log("IF CONDITION MET");
    } else {
        console.log("IF CONDITION FAILED");
        console.log("referredBy:", updatedBusiness.referredBy);
        console.log("referralRewardClaimed:", updatedBusiness.referralRewardClaimed);
    }
  } catch(e) {
      console.error("ERROR", e);
  }
  process.exit(0);
}
test();
