export const isEmailValid = (email) => /\S+@\S+\.\S+/.test(email);

export const isPasswordValid = (password) =>
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*])[A-Za-z\d!@#$%^&*]{8,}$/.test(password);

export const isNameValid = (name) =>
    /^[a-zA-Z\s]{2,}$/.test(name); // Letters and spaces, at least 2 characters

export const isPhoneValid = (phone) =>
    /^(?:\+91\s?)?(?:\(?[2-9][0-9]{2}\)?[\s.-]?[2-9][0-9]{2}[\s.-]?[0-9]{4})$/.test(phone);

export const isUSPhoneValid = (phone) =>
    /^(?:\+1\s?)?(?:\(?[2-9][0-9]{2}\)?[\s.-]?[2-9][0-9]{2}[\s.-]?[0-9]{4})$/.test(phone);
