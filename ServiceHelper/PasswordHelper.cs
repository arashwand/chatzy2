using System.Security.Cryptography;
using System.Text;

namespace Messenger.WebApp.Helpers
{
    public class PasswordHelper
    {
        /// <summary>
        /// از ترکیب پسورد هش شده و سالت استفاده کردیم
        /// بنابراین از این متد استفاده نمیکنیم
        /// </summary>
        //public static void CreatePasswordHash(string password, out byte[] passwordHash, out byte[] passwordSalt)
        //{
        //    using (var hmac = new HMACSHA256())
        //    {
        //        passwordSalt = hmac.Key;
        //        passwordHash = hmac.ComputeHash(Encoding.UTF8.GetBytes(password));
        //    }
        //}

        private const int SaltSize = 16;
        private const int HashSize = 32;
        private const int Iterations = 10000;

        /// <summary>
        /// هش کردن پسورد وارد شده
        /// </summary>
        /// <param name="password"></param>
        /// <returns></returns>
        public static string HashPassword(string password)
        {
            // تولید Salt  
            byte[] salt = new byte[SaltSize];
            RandomNumberGenerator.Fill(salt); // استفاده از RandomNumberGenerator برای تولید Salt  

            // تولید hash با استفاده از password و salt  
            using var pbkdf2 = new Rfc2898DeriveBytes(password, salt, Iterations);
            byte[] hash = pbkdf2.GetBytes(HashSize);

            // ترکیب salt و hash به یک آرایه بایت واحد  
            byte[] hashBytes = new byte[SaltSize + HashSize];
            Buffer.BlockCopy(salt, 0, hashBytes, 0, SaltSize);
            Buffer.BlockCopy(hash, 0, hashBytes, SaltSize, HashSize);

            return Convert.ToBase64String(hashBytes);
        }

        /// <summary>
        /// مقایسه پسورد وارد شده با پسورد هش شده
        /// </summary>
        /// <param name="inputPassword"></param>
        /// <param name="hashedPassword"></param>
        /// <returns></returns>
        public static bool VerifyPassword(string inputPassword, string hashedPassword)
        {
            // تبدیل رشته Base64 به آرایه بایت  
            byte[] hashBytes = Convert.FromBase64String(hashedPassword);

            // استخراج Salt از hashBytes  
            byte[] salt = hashBytes.AsSpan(0, SaltSize).ToArray();

            // تولید hash جدید با استفاده از password و salt  
            using var pbkdf2 = new Rfc2898DeriveBytes(inputPassword, salt, Iterations);
            byte[] hash = pbkdf2.GetBytes(HashSize);

            // مقایسه hash تولید شده با hash موجود  
            return hashBytes.AsSpan(SaltSize).SequenceEqual(hash);
        }

        public static string GetRandomPassword()
        {
            return new Random().Next(24351, 98989).ToString();
        }


        #region Encrypt - Decrypt
        private static readonly string key = "A1B2C3D4E5F6G7H8I9J0K1L2"; // 24-بایت کلید

        /// <summary>
        /// هرنوع دیتایی که قرار است رمزنگاری شود را میگیرد و رمزنگاری میکند
        /// </summary>
        /// <param name="plainText">متن یا دیتا</param>
        /// <param name="key">کلیدی رمزنگاری که در بازیابی هم لازم است</param>
        /// <returns></returns>
        public static string Encrypt(string plainText)
        {
            using (Aes aesAlg = Aes.Create())
            {
                aesAlg.Key = Encoding.UTF8.GetBytes(key);
                aesAlg.IV = new byte[16]; // Initialization Vector

                ICryptoTransform encryptor = aesAlg.CreateEncryptor(aesAlg.Key, aesAlg.IV);
                byte[] encryptedData;

                using (MemoryStream msEncrypt = new MemoryStream())
                {
                    using (CryptoStream csEncrypt = new CryptoStream(msEncrypt, encryptor, CryptoStreamMode.Write))
                    {
                        using (StreamWriter swEncrypt = new StreamWriter(csEncrypt))
                        {
                            swEncrypt.Write(plainText);
                        }
                        encryptedData = msEncrypt.ToArray();
                    }
                }

                return Convert.ToBase64String(encryptedData);
            }
        }

        /// <summary>
        /// رمزگشایی متن رمزنگاری شده
        /// </summary>
        /// <param name="cipherText">متن رمزنگاری شده</param>
        /// <param name="key">کلیدی که برای رمزنگاری بکار رفته</param>
        /// <returns></returns>
        public static string Decrypt(string cipherText)
        {
            using (Aes aesAlg = Aes.Create())
            {
                aesAlg.Key = Encoding.UTF8.GetBytes(key);
                aesAlg.IV = new byte[16]; // Initialization Vector

                ICryptoTransform decryptor = aesAlg.CreateDecryptor(aesAlg.Key, aesAlg.IV);
                byte[] cipherBytes = Convert.FromBase64String(cipherText);
                string decryptedText;

                using (MemoryStream msDecrypt = new MemoryStream(cipherBytes))
                {
                    using (CryptoStream csDecrypt = new CryptoStream(msDecrypt, decryptor, CryptoStreamMode.Read))
                    {
                        using (StreamReader srDecrypt = new StreamReader(csDecrypt))
                        {
                            decryptedText = srDecrypt.ReadToEnd();
                        }
                    }
                }

                return decryptedText;
            }
        }

        #endregion /Encrypt - Decrypt

    }
}
