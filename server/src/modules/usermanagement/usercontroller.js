const User = require("../../models/usermanagement/user");

const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const jwtSecret =
  "ad8cfdfe03c3076a4acb369ec18fbfc26b28bc78577b64da02646cd7bd0fe9c7d97cab";

const OTP = require("../../models/usermanagement/otp");
const otpGenerator = require("otp-generator");
const dotenv = require("dotenv"); // Corrected import
const fs = require("fs");
const ejs = require("ejs");
const mailSender = require("./mailsender");
const path = require("path");
const ejsTemplatePath = path.join(__dirname, "otpBody.ejs");
dotenv.config();

exports.register = async (req, res, next) => {
  const { email, password } = req.body;
  console.log(req);

  if (!password || password.length < 6) {
    return res.status(400).json({ message: "Password less than 6 characters" });
  }
  try {
    // Hash the password using bcrypt
    bcrypt.hash(password, 10, async (hashErr, hash) => {
      if (hashErr) {
        return res
          .status(500)
          .json({ message: "Password hashing failed", error: hashErr.message });
      }

      // Create the user with the hashed password
      try {
        const user = await User.create({
          email,
          password: hash,
        });

        // Generate a JWT token
        const maxAge = 3 * 60 * 60 * 60; // 3 hours in seconds
        const token = jwt.sign(
          { id: user._id, email, role: user.role },
          jwtSecret,
          {
            expiresIn: maxAge,
          }
        );

        // Set the JWT token as a cookie
        res.cookie("jwt", token, {
          httpOnly: true,
          maxAge: maxAge * 1000,
        });

        res.status(201).json({
          message: "User successfully created",
          user,
        });
      } catch (createErr) {
        res.status(400).json({
          message: "User not successful created",
          error: createErr.message,
        });
      }
    });
  } catch (err) {
    res.status(401).json({
      message: "User not successful created",
      error: err.message,
    });
  }
};

// login
exports.login = async (req, res, next) => {
  const { email, password } = req.body;

  // Check if username and password are provided
  if (!email || !password) {
    return res.status(400).json({
      message: "Username or Password not present",
    });
  }

  try {
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(400).json({
        message: "Login not successful",
        error: "User not found",
      });
    }

    // Compare given password with hashed password
    bcrypt.compare(password, user.password, (compareErr, result) => {
      if (compareErr) {
        return res.status(500).json({
          message: "Password comparison failed",
          error: compareErr.message,
        });
      }

      if (result) {
        const maxAge = 3 * 60 * 60; // 3 hours in seconds
        const token = jwt.sign(
          { id: user._id, email, role: user.role },
          jwtSecret,
          {
            expiresIn: maxAge,
          }
        );

        // Set the JWT token as a cookie
        res.cookie("jwt", token, {
          httpOnly: true,
          maxAge: maxAge * 10000,
          // domain: "nitjtt.netlify.app",
          secure: true,
          sameSite: "none",
        });

        res.status(200).json({
          message: "User successfully logged in",
          user,
        });
      } else {
        res.status(400).json({ message: "Login not successful" });
      }
    });
  } catch (error) {
    res.status(400).json({
      message: "An error occurred",
      error: error.message,
    });
  }
};

exports.update = async (req, res, next) => {
  try {
    const { email, password, role } = req.body;

    // Verify if the email is present
    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    // Find the user by email
    const user = await User.findOne({ email });

    // If user is not found
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Update user details
    if (password) {
      // Update password if provided
      const hashedPassword = await bcrypt.hash(password, 10);
      user.password = hashedPassword;
    }

    if (role) {
      // Update role if provided
      // Verify if the role is valid
      user.role = role;
    }

    // Save the updated user
    await user.save();

    return res.status(201).json({ message: "Update successful", user });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "An error occurred", error: error.message });
  }
};

const sendOTP = async (email) => {
  try {
    const checkuser = await User.findOne({ email: email });
    if (!checkuser) {
      console.log("User not exists");
      return {
        success: false,
        message: "User not exists",
      };
    }

    let result = await OTP.findOne({ email });
    var otp = null;
    if (result) {
      otp = result.otp;
      console.log("OTP already exists:", otp);
    } else {
      otp = otpGenerator.generate(6, {
        lowerCaseAlphabets: false,
        upperCaseAlphabets: false,
        specialChars: false,
      });
      await OTP.create({ email, otp });
      console.log("New OTP generated:", otp);
    }

    console.log(otp);
    const otpInfo = {
      title: "Email verification for NITJ",
      purpose:
        "Thank you for registering with NITJ. To complete your registration, please use the following OTP (One-Time Password) to verify your account:",
      OTP: otp,
    };

    const otpBody = fs.readFileSync(ejsTemplatePath, "utf-8");
    const renderedHTML = ejs.render(otpBody, otpInfo);

    // Add await here
    await mailSender(email, "Sign Up verification", renderedHTML);

    return {
      success: true,
      message: "OTP sent successfully",
    };
  } catch (e) {
    console.log("Error in sending OTP ", e);
    return {
      success: false,
      message: "Error in sending OTP",
    };
  }
};
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const checkuser = await User.findOne({ email: email });
    if (!checkuser) {
      console.log("User not exists");
      return res.status(200).json({
        success: false,
        message: "User not exists",
      });
    }

    // Generate and send OTP
    const otp = await sendOTP(email);

    return res.status(200).json({
      success: true,
      message: "OTP sent successfully",
      otp: otp, // Send the OTP to the client for verification
    });
  } catch (e) {
    console.log("Error in sending OTP ", e);
    return res.status(402).json({
      success: false,
      message: "Error in sending OTP",
    });
  }
};
const verifyOTP = async (email, enteredOTP) => {
  try {
    const otpRecord = await OTP.findOne({ email });

    if (!otpRecord) {
      console.log("No OTP record found for the user");
      return false;
    }

    const storedOTP = otpRecord.otp;

    // Compare the entered OTP with the stored OTP
    return enteredOTP === storedOTP;
  } catch (error) {
    console.log("Error verifying OTP: ", error);
    return false;
  }
};

// Reset Password
exports.resetPassword = async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;

    // Verify the OTP
    const isOTPValid = await verifyOTP(email, otp);

    if (!isOTPValid) {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP",
      });
    }

    // Update the password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    const user = await User.findOneAndUpdate(
      { email: email },
      { $set: { password: hashedPassword } },
      { new: true }
    );

    return res.status(200).json({
      success: true,
      message: "Password updated successfully",
      user,
    });
  } catch (e) {
    console.log("Error in resetting password ", e);
    return res.status(500).json({
      success: false,
      message: "Error in resetting password",
    });
  }
};
